import { Injectable } from "@nestjs/common";
import {
  AI_PLATFORMS,
  type AiAnswer,
  type AiBrand,
  type AiPlatform,
  type AiPromptDetail,
  type AiPromptList,
  type AiPromptRow,
  type AiPromptsQuery,
  type AiSources,
  type AiVisibilitySummary,
} from "@seo-geo/contracts";
import { AI_VISIBILITY_SCORE_VERSION, addDays, dateInTimeZone } from "@seo-geo/core";
import { normalizeUrl } from "@seo-geo/core/audit";
import { Prisma, type BrandEntity, type Project, type Prompt } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { CredentialsService } from "../credentials/credentials.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { analysisContext, mentionSpans } from "./ai-analysis.js";
import {
  buildVisibility,
  type CitationBucket,
  type MentionBucket,
  type RunBucket,
} from "./ai-read-model.js";
import { loadAiSettings } from "./ai-settings.js";

/** Answers shown on a prompt's page, newest first. */
const MAX_PROMPT_ANSWERS = 60;
const TOP_SOURCES = 10;
const MAX_SOURCE_ROWS = 100;
/** Matches no brand: used when a project has no own brand. */
const NO_ENTITY = "00000000-0000-0000-0000-000000000000";

type Sentiment = "positive" | "neutral" | "negative";

interface DomainRow {
  domain: string;
  citations: number;
  prompts: number;
  platforms: AiPlatform[];
  entityId: string | null;
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

function toSentiment(value: string | null): Sentiment | null {
  return value === "positive" || value === "neutral" || value === "negative" ? value : null;
}

/** Reports on a project's AI visibility (docs/geo-aeo.md, "Metrics"). */
@Injectable()
export class AiReadModelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
  ) {}

  async summary(
    workspaceId: string,
    projectId: string,
    days: number,
  ): Promise<AiVisibilitySummary> {
    const project = await this.project(workspaceId, projectId);
    const { start, end } = this.range(project, days);
    const previousStart = addDays(start, -days);
    const [settings, brands, total, active, pendingRuns, lastRun, providerReady] =
      await Promise.all([
        loadAiSettings(this.prisma, projectId),
        this.brands(projectId),
        this.prisma.prompt.count({ where: { projectId } }),
        this.prisma.prompt.count({ where: { projectId, active: true } }),
        this.prisma.aiRun.count({ where: { projectId, status: "PENDING" } }),
        this.prisma.aiRun.findFirst({
          where: { projectId, status: "COMPLETED" },
          orderBy: { runOn: "desc" },
          select: { runOn: true },
        }),
        this.credentials.hasDataForSeo(workspaceId),
      ]);
    const [buckets, sources] = await Promise.all([
      this.buckets(projectId, previousStart, start, end),
      this.domains(projectId, start, end, TOP_SOURCES),
    ]);
    const visibility = buildVisibility({
      buckets,
      entityIds: brands.map((brand) => brand.id),
      platforms: settings.platforms,
      start,
      end,
    });
    return {
      providerReady,
      settings,
      prompts: { total, active },
      pendingRuns,
      lastRunOn: lastRun ? isoDay(lastRun.runOn) : null,
      range: { start, end },
      scoreVersion: AI_VISIBILITY_SCORE_VERSION,
      brands: brands.map(toAiBrand),
      ...visibility,
      topSources: sources.rows.map((row) => ({
        domain: row.domain,
        citations: row.citations,
        share: sources.total > 0 ? row.citations / sources.total : 0,
        entityId: row.entityId,
      })),
    };
  }

  async prompts(
    workspaceId: string,
    projectId: string,
    query: AiPromptsQuery,
  ): Promise<AiPromptList> {
    const project = await this.project(workspaceId, projectId);
    const { start, end } = this.range(project, query.days);
    const where: Prisma.PromptWhereInput = {
      projectId,
      ...(query.search ? { text: { contains: query.search, mode: "insensitive" } } : {}),
      ...(query.tag ? { tags: { has: query.tag } } : {}),
    };
    const [prompts, total, tags, brands] = await Promise.all([
      this.prisma.prompt.findMany({
        where,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: query.offset,
        take: query.limit,
      }),
      this.prisma.prompt.count({ where }),
      this.prisma.$queryRaw<{ tag: string }[]>`
        SELECT DISTINCT unnest(tags) AS tag FROM prompt
        WHERE project_id = ${projectId}::uuid ORDER BY tag`,
      this.brands(projectId),
    ]);
    const ownId = brands.find((brand) => brand.kind === "OWN")?.id ?? null;
    return {
      data: await this.promptRows(prompts, ownId, start, end),
      total,
      tags: tags.map((row) => row.tag),
    };
  }

  async detail(
    workspaceId: string,
    projectId: string,
    promptId: string,
    days: number,
  ): Promise<AiPromptDetail> {
    const project = await this.project(workspaceId, projectId);
    const prompt = await this.prisma.prompt.findFirst({
      where: { id: promptId, workspaceId, projectId },
    });
    if (!prompt) throw ProblemException.notFound("Prompt not found.");
    const { start, end } = this.range(project, days);
    const [brands, runs] = await Promise.all([
      this.brands(projectId),
      this.prisma.aiRun.findMany({
        where: { promptId, runOn: { gte: asDate(start), lte: asDate(end) } },
        orderBy: [{ runOn: "desc" }, { createdAt: "desc" }, { sampleIndex: "asc" }],
        take: MAX_PROMPT_ANSWERS,
        include: {
          mentions: { orderBy: { firstRank: "asc" } },
          citations: { orderBy: { rank: "asc" } },
        },
      }),
    ]);
    const ownId = brands.find((brand) => brand.kind === "OWN")?.id ?? null;
    const [row] = await this.promptRows([prompt], ownId, start, end);
    const context = analysisContext(project, brands, new Set());

    const answers: AiAnswer[] = runs.map((run) => {
      const spans = run.answer
        ? mentionSpans(
            run.answer,
            context.brands,
            new Set(run.mentions.map((mention) => mention.entityId)),
          )
        : new Map();
      return {
        id: run.id,
        platform: run.platform,
        method: run.method,
        model: run.model,
        runOn: isoDay(run.runOn),
        sampleIndex: run.sampleIndex,
        status: run.status,
        completedAt: run.completedAt?.toISOString() ?? null,
        error: run.error,
        answer: run.answer,
        webSearch: run.webSearch,
        fanOutQueries: run.fanOutQueries,
        mentions: run.mentions.map((mention) => ({
          entityId: mention.entityId,
          firstRank: mention.firstRank,
          mentionCount: mention.mentionCount,
          sentiment: toSentiment(mention.sentiment),
          spans: spans.get(mention.entityId) ?? [],
        })),
        citations: run.citations.map((citation) => ({
          rank: citation.rank,
          url: citation.url,
          domain: citation.domain,
          title: citation.title,
          entityId: citation.entityId,
          pageUrl: citation.pageUrl,
        })),
        costUsd: run.costUsd.toNumber(),
      };
    });
    if (!row) throw ProblemException.notFound("Prompt not found.");
    return { prompt: row, brands: brands.map(toAiBrand), answers };
  }

  async sources(workspaceId: string, projectId: string, days: number): Promise<AiSources> {
    const project = await this.project(workspaceId, projectId);
    const { start, end } = this.range(project, days);
    const brands = await this.brands(projectId);
    const ownId = brands.find((brand) => brand.kind === "OWN")?.id ?? null;
    const [domains, pages] = await Promise.all([
      this.domains(projectId, start, end, MAX_SOURCE_ROWS),
      ownId ? this.ownPages(projectId, ownId, start, end) : [],
    ]);
    return {
      range: { start, end },
      totalCitations: domains.total,
      domains: domains.rows.map((row) => ({
        ...row,
        share: domains.total > 0 ? row.citations / domains.total : 0,
      })),
      pages,
    };
  }

  // ── Queries ───────────────────────────────────────────────────────────────────────

  /** Completed answers, mentions and citations by period, platform and week. */
  private async buckets(projectId: string, from: string, currentFrom: string, to: string) {
    const [runs, mentions, citations] = await Promise.all([
      this.prisma.$queryRaw<(Omit<RunBucket, "week"> & { week: Date })[]>`
        SELECT r.run_on >= ${currentFrom}::date AS current, r.platform::text AS platform,
          date_trunc('week', r.run_on::timestamp)::date AS week, count(*)::int AS runs
        FROM ai_run r
        WHERE r.project_id = ${projectId}::uuid AND r.status = 'COMPLETED'
          AND r.run_on BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1, 2, 3`,
      this.prisma.$queryRaw<(Omit<MentionBucket, "week"> & { week: Date })[]>`
        SELECT r.run_on >= ${currentFrom}::date AS current, r.platform::text AS platform,
          date_trunc('week', r.run_on::timestamp)::date AS week, m.entity_id::text AS "entityId",
          count(*)::int AS mentioned, sum(m.first_rank)::int AS "rankSum",
          sum(1.0 / greatest(m.first_rank, 1))::float8 AS "prominenceSum"
        FROM ai_mention m JOIN ai_run r ON r.id = m.run_id
        WHERE r.project_id = ${projectId}::uuid AND r.status = 'COMPLETED'
          AND r.run_on BETWEEN ${from}::date AND ${to}::date
        GROUP BY 1, 2, 3, 4`,
      this.prisma.$queryRaw<(Omit<CitationBucket, "week"> & { week: Date })[]>`
        SELECT r.run_on >= ${currentFrom}::date AS current, r.platform::text AS platform,
          date_trunc('week', r.run_on::timestamp)::date AS week, c.entity_id::text AS "entityId",
          count(DISTINCT c.run_id)::int AS cited
        FROM ai_citation c JOIN ai_run r ON r.id = c.run_id
        WHERE r.project_id = ${projectId}::uuid AND r.status = 'COMPLETED'
          AND r.run_on BETWEEN ${from}::date AND ${to}::date AND c.entity_id IS NOT NULL
        GROUP BY 1, 2, 3, 4`,
    ]);
    const withWeek = <T extends { week: Date }>(rows: T[]) =>
      rows.map((row) => ({ ...row, week: isoDay(row.week) }));
    return {
      runs: withWeek(runs),
      mentions: withWeek(mentions),
      citations: withWeek(citations),
    };
  }

  /** Cited domains by citations, with the prompts and platforms citing them. */
  private async domains(
    projectId: string,
    from: string,
    to: string,
    limit: number,
  ): Promise<{ total: number; rows: DomainRow[] }> {
    const [rows, totals] = await Promise.all([
      this.prisma.$queryRaw<DomainRow[]>`
        SELECT c.domain, count(*)::int AS citations, count(DISTINCT r.prompt_id)::int AS prompts,
          array_agg(DISTINCT r.platform::text) AS platforms,
          (array_agg(c.entity_id::text) FILTER (WHERE c.entity_id IS NOT NULL))[1] AS "entityId"
        FROM ai_citation c JOIN ai_run r ON r.id = c.run_id
        WHERE r.project_id = ${projectId}::uuid AND r.status = 'COMPLETED'
          AND r.run_on BETWEEN ${from}::date AND ${to}::date
        GROUP BY c.domain
        ORDER BY citations DESC, c.domain
        LIMIT ${limit}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT count(*)::int AS total
        FROM ai_citation c JOIN ai_run r ON r.id = c.run_id
        WHERE r.project_id = ${projectId}::uuid AND r.status = 'COMPLETED'
          AND r.run_on BETWEEN ${from}::date AND ${to}::date`,
    ]);
    return { total: totals[0]?.total ?? 0, rows: rows.map(sortPlatforms) };
  }

  /** The own site's cited pages, merged by normalized URL. */
  private async ownPages(
    projectId: string,
    ownId: string,
    from: string,
    to: string,
  ): Promise<AiSources["pages"]> {
    const rows = await this.prisma.$queryRaw<
      {
        url: string;
        pageUrl: string | null;
        promptId: string;
        platform: AiPlatform;
        citations: number;
      }[]
    >`
      SELECT c.url, c.page_url AS "pageUrl", r.prompt_id::text AS "promptId",
        r.platform::text AS platform, count(*)::int AS citations
      FROM ai_citation c JOIN ai_run r ON r.id = c.run_id
      WHERE r.project_id = ${projectId}::uuid AND r.status = 'COMPLETED'
        AND r.run_on BETWEEN ${from}::date AND ${to}::date
        AND c.entity_id = ${ownId}::uuid AND c.url IS NOT NULL
      GROUP BY 1, 2, 3, 4`;
    const pages = new Map<
      string,
      { citations: number; prompts: Set<string>; platforms: Set<AiPlatform>; known: boolean }
    >();
    for (const row of rows) {
      const url = row.pageUrl ?? normalizeUrl(row.url) ?? row.url;
      const page = pages.get(url) ?? {
        citations: 0,
        prompts: new Set<string>(),
        platforms: new Set<AiPlatform>(),
        known: false,
      };
      page.citations += row.citations;
      page.prompts.add(row.promptId);
      page.platforms.add(row.platform);
      page.known ||= row.pageUrl !== null;
      pages.set(url, page);
    }
    return [...pages]
      .map(([url, page]) => ({
        url,
        citations: page.citations,
        prompts: page.prompts.size,
        platforms: sortedPlatforms(page.platforms),
        known: page.known,
      }))
      .sort((a, b) => b.citations - a.citations || a.url.localeCompare(b.url))
      .slice(0, MAX_SOURCE_ROWS);
  }

  /** List rows of prompts: the own brand over the range and the latest answer per platform. */
  private async promptRows(
    prompts: readonly Prompt[],
    ownId: string | null,
    from: string,
    to: string,
  ): Promise<AiPromptRow[]> {
    if (prompts.length === 0) return [];
    const ids = prompts.map((prompt) => prompt.id);
    const own = ownId ?? NO_ENTITY;
    const [stats, latest, pending] = await Promise.all([
      this.prisma.$queryRaw<{ promptId: string; runs: number; mentioned: number; cited: number }[]>`
        SELECT r.prompt_id::text AS "promptId", count(*)::int AS runs,
          count(m.run_id)::int AS mentioned,
          count(*) FILTER (WHERE EXISTS (
            SELECT 1 FROM ai_citation c WHERE c.run_id = r.id AND c.entity_id = ${own}::uuid
          ))::int AS cited
        FROM ai_run r
        LEFT JOIN ai_mention m ON m.run_id = r.id AND m.entity_id = ${own}::uuid
        WHERE r.prompt_id = ANY(${ids}::uuid[]) AND r.status = 'COMPLETED'
          AND r.run_on BETWEEN ${from}::date AND ${to}::date
        GROUP BY r.prompt_id`,
      this.prisma.$queryRaw<
        {
          promptId: string;
          platform: AiPlatform;
          runOn: Date;
          rank: number | null;
          cited: boolean;
          competitors: number;
        }[]
      >`
        SELECT DISTINCT ON (r.prompt_id, r.platform) r.prompt_id::text AS "promptId",
          r.platform::text AS platform, r.run_on AS "runOn", m.first_rank AS rank,
          EXISTS (
            SELECT 1 FROM ai_citation c WHERE c.run_id = r.id AND c.entity_id = ${own}::uuid
          ) AS cited,
          (SELECT count(*)::int FROM ai_mention o
            WHERE o.run_id = r.id AND o.entity_id <> ${own}::uuid) AS competitors
        FROM ai_run r
        LEFT JOIN ai_mention m ON m.run_id = r.id AND m.entity_id = ${own}::uuid
        WHERE r.prompt_id = ANY(${ids}::uuid[]) AND r.status = 'COMPLETED'
        ORDER BY r.prompt_id, r.platform, r.run_on DESC, r.completed_at DESC, r.sample_index`,
      this.prisma.aiRun.findMany({
        where: { promptId: { in: ids }, status: "PENDING" },
        distinct: ["promptId"],
        select: { promptId: true },
      }),
    ]);
    const statsById = new Map(stats.map((row) => [row.promptId, row]));
    const pendingIds = new Set(pending.map((row) => row.promptId));
    const latestById = new Map<string, typeof latest>();
    for (const row of latest) {
      latestById.set(row.promptId, [...(latestById.get(row.promptId) ?? []), row]);
    }
    return prompts.map((prompt) => {
      const counts = statsById.get(prompt.id);
      const answers = (latestById.get(prompt.id) ?? []).sort((a, b) =>
        byPlatform(a.platform, b.platform),
      );
      const lastRunOn = answers.reduce<string | null>((last, row) => {
        const day = isoDay(row.runOn);
        return last === null || day > last ? day : last;
      }, null);
      return {
        id: prompt.id,
        text: prompt.text,
        locationCode: prompt.locationCode,
        languageCode: prompt.languageCode,
        tags: prompt.tags,
        active: prompt.active,
        createdAt: prompt.createdAt.toISOString(),
        lastRunOn,
        runs: counts?.runs ?? 0,
        mentionRate: counts && counts.runs > 0 ? counts.mentioned / counts.runs : null,
        citationRate: counts && counts.runs > 0 ? counts.cited / counts.runs : null,
        latest: answers.map((row) => ({
          platform: row.platform,
          runOn: isoDay(row.runOn),
          mentioned: row.rank !== null,
          rank: row.rank,
          cited: row.cited,
          competitors: row.competitors,
        })),
        pending: pendingIds.has(prompt.id),
      };
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────────

  /** The last `days` days up to today in the project's time zone. */
  private range(project: Project, days: number): { start: string; end: string } {
    const end = dateInTimeZone(new Date(), project.timezone);
    return { start: addDays(end, 1 - days), end };
  }

  private brands(projectId: string): Promise<BrandEntity[]> {
    return this.prisma.brandEntity.findMany({
      where: { projectId },
      orderBy: [{ colorSlot: "asc" }, { createdAt: "asc" }],
    });
  }

  private async project(workspaceId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }
}

/** Platforms in display order. */
function byPlatform(a: AiPlatform, b: AiPlatform): number {
  return AI_PLATFORMS.indexOf(a) - AI_PLATFORMS.indexOf(b);
}

function sortedPlatforms(platforms: Iterable<AiPlatform>): AiPlatform[] {
  return [...platforms].sort(byPlatform);
}

function sortPlatforms(row: DomainRow): DomainRow {
  return { ...row, platforms: sortedPlatforms(row.platforms) };
}

function toAiBrand(brand: BrandEntity): AiBrand {
  return {
    entityId: brand.id,
    name: brand.name,
    kind: brand.kind,
    colorSlot: brand.colorSlot,
  };
}
