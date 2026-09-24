import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  MAX_TRACKED_KEYWORDS_PER_PROJECT,
  type KeywordDetail,
  type RankTrackerData,
  type TrackKeywords,
  type TrackKeywordsQuote,
  type TrackKeywordsResult,
  type UpdateTrackedKeyword,
} from "@seo-geo/contracts";
import {
  addDays,
  dateInTimeZone,
  keywordProblem,
  linkMatches,
  normalizeKeyword,
  type DomainTarget,
} from "@seo-geo/core";
import { roundUsd } from "@seo-geo/dataforseo";
import type { BrandEntity, Device, Project } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { CredentialsService } from "../credentials/credentials.service.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  KeywordMetricsService,
  metricKey,
  toKeywordMetrics,
} from "../keywords/keyword-metrics.service.js";
import { UsageService } from "../usage/usage.service.js";
import { RankChecksService, rankCheckCost } from "./rank-checks.service.js";
import { EXTRA_HISTORY_DAYS, buildRankTracker, parseCompetitorRanks } from "./rank-read-model.js";
import { SnapshotAiOverviewSchema, SnapshotOrganicSchema } from "./snapshot.js";

const CHECK_FIELDS = {
  trackedKeywordId: true,
  checkedOn: true,
  status: true,
  depth: true,
  position: true,
  url: true,
  serpFeatures: true,
  ownedFeatures: true,
  aiOverviewPresent: true,
  aiOverviewCited: true,
  competitorRanks: true,
} as const;

/** Checks per 30 days at each frequency, for monthly cost estimates. */
const CHECKS_PER_MONTH = { DAILY: 30, WEEKLY: 30 / 7 } as const;

interface Market {
  locationCode: number;
  languageCode: string;
  device: Device;
}

/** Tracked keywords of a project and their rankings. */
@Injectable()
export class RankTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: KeywordMetricsService,
    private readonly checks: RankChecksService,
    private readonly usage: UsageService,
    private readonly credentials: CredentialsService,
  ) {}

  async data(workspaceId: string, projectId: string, days: number): Promise<RankTrackerData> {
    const project = await this.project(workspaceId, projectId);
    const today = dateInTimeZone(new Date(), project.timezone);
    const from = addDays(today, -(days + EXTRA_HISTORY_DAYS));
    const [keywords, checks, brands, providerReady] = await Promise.all([
      this.prisma.trackedKeyword.findMany({
        where: { workspaceId, projectId },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      }),
      this.prisma.rankCheck.findMany({
        where: { workspaceId, projectId, checkedOn: { gte: new Date(`${from}T00:00:00Z`) } },
        select: CHECK_FIELDS,
      }),
      this.brands(workspaceId, projectId),
      this.credentials.hasDataForSeo(workspaceId),
    ]);
    const stored = await this.metrics.lookup(keywords);
    const metrics = new Map(
      keywords.flatMap((keyword) => {
        const row = stored.get(metricKey(keyword.keyword, keyword));
        return row ? [[keyword.id, toKeywordMetrics(row)] as const] : [];
      }),
    );
    const view = buildRankTracker({ keywords, checks, metrics, brands, today, days });
    return { ...view, providerReady };
  }

  /** What adding the keywords would do and cost; nothing is saved. */
  async quote(
    workspaceId: string,
    projectId: string,
    input: TrackKeywords,
  ): Promise<TrackKeywordsQuote> {
    const project = await this.project(workspaceId, projectId);
    return this.prepare(project, input);
  }

  async track(
    workspaceId: string,
    projectId: string,
    input: TrackKeywords,
    userId: string,
  ): Promise<TrackKeywordsResult> {
    const project = await this.project(workspaceId, projectId);
    const quote = await this.prepare(project, input);
    const result = { added: 0, duplicates: quote.duplicates, invalid: quote.invalid.length };
    if (quote.keywords.length === 0) return result;

    const tracked = await this.prisma.trackedKeyword.count({ where: { projectId } });
    if (tracked + quote.keywords.length > MAX_TRACKED_KEYWORDS_PER_PROJECT) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: `A project can track up to ${MAX_TRACKED_KEYWORDS_PER_PROJECT} keywords.`,
      });
    }
    await this.usage.assertCanSpend(workspaceId, quote.checkCostUsd + quote.metricsCostUsd);

    const market = this.market(project, input);
    const { count } = await this.prisma.trackedKeyword.createMany({
      data: quote.keywords.map((keyword) => ({
        workspaceId,
        projectId,
        keyword,
        ...market,
        tags: [...new Set(input.tags)],
        frequency: input.frequency,
        createdBy: userId,
      })),
      skipDuplicates: true,
    });
    await this.metrics.requestEnrichment({
      workspaceId,
      projectId,
      locationCode: market.locationCode,
      languageCode: market.languageCode,
      keywords: quote.keywords,
    });
    await this.checks.requestCheck(projectId);
    return { ...result, added: count };
  }

  async update(
    workspaceId: string,
    projectId: string,
    keywordId: string,
    input: UpdateTrackedKeyword,
  ): Promise<void> {
    const { count } = await this.prisma.trackedKeyword.updateMany({
      where: { id: keywordId, workspaceId, projectId },
      data: {
        ...(input.tags ? { tags: [...new Set(input.tags)] } : {}),
        ...(input.targetUrl !== undefined ? { targetUrl: input.targetUrl } : {}),
        ...(input.frequency ? { frequency: input.frequency } : {}),
      },
    });
    if (count === 0) throw ProblemException.notFound("Keyword not found.");
  }

  /** Stops tracking and deletes the keywords' history. */
  async remove(workspaceId: string, projectId: string, ids: readonly string[]): Promise<number> {
    const { count } = await this.prisma.trackedKeyword.deleteMany({
      where: { id: { in: [...ids] }, workspaceId, projectId },
    });
    return count;
  }

  /** Checks keywords that are due now instead of waiting for the hourly schedule. */
  async checkNow(workspaceId: string, projectId: string): Promise<void> {
    const project = await this.project(workspaceId, projectId);
    if (!(await this.credentials.hasDataForSeo(workspaceId))) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.ProviderError,
        detail: "Connect a working DataForSEO account in the workspace settings first.",
      });
    }
    await this.checks.requestCheck(project.id);
  }

  async detail(
    workspaceId: string,
    projectId: string,
    keywordId: string,
    days: number,
  ): Promise<KeywordDetail> {
    const project = await this.project(workspaceId, projectId);
    const keyword = await this.prisma.trackedKeyword.findFirst({
      where: { id: keywordId, workspaceId, projectId },
    });
    if (!keyword) throw ProblemException.notFound("Keyword not found.");

    const today = dateInTimeZone(new Date(), project.timezone);
    const from = addDays(today, -(days + EXTRA_HISTORY_DAYS));
    const [checks, brands, stored] = await Promise.all([
      this.prisma.rankCheck.findMany({
        where: {
          trackedKeywordId: keyword.id,
          checkedOn: { gte: new Date(`${from}T00:00:00Z`) },
        },
        select: { ...CHECK_FIELDS, serpSnapshotId: true },
        orderBy: { checkedOn: "asc" },
      }),
      this.brands(workspaceId, projectId),
      this.metrics.lookup([keyword]),
    ]);
    const metricsRow = stored.get(metricKey(keyword.keyword, keyword));
    const view = buildRankTracker({
      keywords: [keyword],
      checks,
      metrics: metricsRow ? new Map([[keyword.id, toKeywordMetrics(metricsRow)]]) : new Map(),
      brands,
      today,
      days,
    });
    const row = view.keywords[0];
    if (!row) throw ProblemException.notFound("Keyword not found.");

    const windowStart = addDays(today, -(days - 1));
    const competitorIds = brands.filter((b) => b.kind === "COMPETITOR").map((b) => b.id);
    const completed = checks.filter(
      (check) => check.status === "COMPLETED" && isoDay(check.checkedOn) >= windowStart,
    );
    const latest = checks.filter((check) => check.status === "COMPLETED").at(-1);
    const snapshot = latest?.serpSnapshotId
      ? await this.prisma.serpSnapshot.findUnique({ where: { id: latest.serpSnapshotId } })
      : null;

    const attribute = this.attribution(project, brands);
    return {
      keyword: row,
      history: completed.map((check) => {
        const ranks = parseCompetitorRanks(check.competitorRanks);
        return {
          date: isoDay(check.checkedOn),
          position: check.position,
          url: check.url,
          competitors: Object.fromEntries(
            competitorIds.map((id) => [id, ranks[id]?.position ?? null]),
          ),
        };
      }),
      serp: snapshot
        ? {
            fetchedAt: snapshot.fetchedAt.toISOString(),
            checkUrl: snapshot.checkUrl,
            itemTypes: snapshot.itemTypes,
            results: SnapshotOrganicSchema.parse(snapshot.organic).map((result) => ({
              position: result.position,
              domain: result.domain,
              url: result.url,
              title: result.title,
              entityId: attribute(result),
            })),
            aiOverview: (() => {
              const overview = SnapshotAiOverviewSchema.parse(snapshot.aiOverview ?? null);
              return overview
                ? {
                    references: overview.references.map((reference) => ({
                      domain: reference.domain,
                      url: reference.url,
                      title: reference.title,
                      entityId: attribute(reference),
                    })),
                  }
                : null;
            })(),
          }
        : null,
    };
  }

  private async prepare(project: Project, input: TrackKeywords): Promise<TrackKeywordsQuote> {
    const market = this.market(project, input);
    const invalid: TrackKeywordsQuote["invalid"] = [];
    const unique = new Set<string>();
    for (const raw of input.keywords) {
      if (raw.trim() === "") continue;
      const keyword = normalizeKeyword(raw, market.languageCode);
      const problem = keywordProblem(keyword);
      if (problem) invalid.push({ keyword: raw.trim().slice(0, 100), problem });
      else unique.add(keyword);
    }
    const existing = await this.prisma.trackedKeyword.findMany({
      where: { projectId: project.id, keyword: { in: [...unique] }, ...market },
      select: { keyword: true },
    });
    const known = new Set(existing.map((row) => row.keyword));
    const keywords = [...unique].filter((keyword) => !known.has(keyword));
    const stale = await this.metrics.stale(market, keywords);
    const checkCostUsd = rankCheckCost(keywords.length);
    return {
      keywords,
      duplicates: known.size,
      invalid,
      checkCostUsd,
      monthlyCostUsd: roundUsd(checkCostUsd * CHECKS_PER_MONTH[input.frequency]),
      metricsCostUsd: this.metrics.estimate(stale.length),
    };
  }

  private market(project: Project, input: TrackKeywords): Market {
    return {
      locationCode: input.locationCode ?? project.defaultLocationCode,
      languageCode: input.languageCode ?? project.defaultLanguageCode,
      device: input.device ?? project.defaultDevice,
    };
  }

  /** Which brand entity a SERP link belongs to: the own site or a competitor. */
  private attribution(project: Project, brands: readonly BrandEntity[]) {
    const own: DomainTarget = [
      { domain: project.domain, includeSubdomains: project.includeSubdomains },
    ];
    const ownId = brands.find((brand) => brand.kind === "OWN")?.id ?? null;
    const competitors = brands
      .filter((brand) => brand.kind === "COMPETITOR")
      .map((brand) => ({
        id: brand.id,
        target: brand.domains.map((domain) => ({ domain, includeSubdomains: true })),
      }));
    return (link: { domain: string | null; url: string | null }): string | null => {
      if (ownId && linkMatches(link, own)) return ownId;
      return competitors.find((competitor) => linkMatches(link, competitor.target))?.id ?? null;
    };
  }

  private brands(workspaceId: string, projectId: string): Promise<BrandEntity[]> {
    return this.prisma.brandEntity.findMany({
      where: { workspaceId, projectId },
      orderBy: { colorSlot: "asc" },
    });
  }

  private async project(workspaceId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
