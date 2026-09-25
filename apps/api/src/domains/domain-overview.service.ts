import { HttpStatus, Injectable } from "@nestjs/common";
import {
  BacklinkProfileSchema,
  DOMAIN_OVERVIEW_LIMITS,
  DomainCompetitorSchema,
  DomainHistoryPointSchema,
  DomainKeywordSchema,
  DomainMetricsSchema,
  ErrorCode,
  type BacklinkProfile,
  type DomainOverview,
  type DomainOverviewQuote,
  type DomainOverviewRequest,
} from "@seo-geo/contracts";
import { normalizeHostname, stripWww } from "@seo-geo/core";
import {
  estimateBacklinksCost,
  estimateLabsCost,
  getBacklinksSummary,
  getCompetitorsDomain,
  getDomainRankOverview,
  getHistoricalRankOverview,
  getRankedKeywords,
  roundUsd,
  type BacklinksSummary,
  type DataForSeoClient,
  type DomainRankMetrics,
} from "@seo-geo/dataforseo";
import { z } from "zod";

import { ProblemException } from "../common/problem.exception.js";
import { CredentialsService } from "../credentials/credentials.service.js";
import { ProviderCacheService } from "../providers/provider-cache.service.js";
import { providerProblem } from "../providers/provider-errors.js";
import { UsageService } from "../usage/usage.service.js";

/** Labs data is updated monthly and backlink profiles change slowly (D23). */
const TTL_DAYS = 7;

/** The requests an overview is made of, each cached on its own. */
const PARTS = ["rank", "history", "keywords", "competitors", "backlinks"] as const;
type Part = (typeof PARTS)[number];

/** Versioned cache operations; bump the version when a cached shape changes. */
const OPERATIONS: Record<Part, string> = {
  rank: "labs.domain_rank_overview@1",
  history: "labs.historical_rank_overview@1",
  keywords: "labs.ranked_keywords@1",
  competitors: "labs.competitors_domain@1",
  backlinks: "backlinks.summary@1",
};

const CACHED = {
  rank: z.object({ organic: DomainMetricsSchema.nullable() }),
  history: z.object({ history: z.array(DomainHistoryPointSchema) }),
  keywords: z.object({ items: z.array(DomainKeywordSchema) }),
  competitors: z.object({ items: z.array(DomainCompetitorSchema) }),
  backlinks: z.object({ profile: BacklinkProfileSchema.nullable() }),
} satisfies Record<Part, z.ZodType>;
type CachedValues = { [P in Part]: z.infer<(typeof CACHED)[P]> };

const ESTIMATES: Record<Part, number> = {
  rank: estimateLabsCost({ items: 1 }),
  history: estimateLabsCost({ items: DOMAIN_OVERVIEW_LIMITS.historyMonths }),
  keywords: estimateLabsCost({ items: DOMAIN_OVERVIEW_LIMITS.keywords }),
  // One more competitor is requested, in case the domain itself is listed.
  competitors: estimateLabsCost({ items: DOMAIN_OVERVIEW_LIMITS.competitors + 1 }),
  backlinks: estimateBacklinksCost({ rows: 1 }),
};

interface Loaded<T> {
  value: T;
  fetchedAt: Date;
  cached: boolean;
  costUsd: number;
}

/** The analyzed host: no scheme, path, port or `www.`. */
export function domainTarget(input: string): string {
  try {
    return stripWww(normalizeHostname(input));
  } catch {
    throw new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.ValidationFailed,
      detail: "Enter a domain such as example.com.",
      errors: [{ path: "domain", message: "Enter a domain such as example.com." }],
    });
  }
}

/** First day of the month `months` before `now` (YYYY-MM-DD, UTC). */
function monthsBefore(now: Date, months: number): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return date.toISOString().slice(0, 10);
}

/** `null` for a target without known links, which DataForSEO reports as zeros. */
function toProfile(summary: BacklinksSummary | null): BacklinkProfile | null {
  if (!summary || (summary.backlinks === 0 && summary.referringDomains === 0)) return null;
  return {
    rank: summary.rank,
    backlinks: summary.backlinks,
    referringDomains: summary.referringDomains,
    referringDomainsNofollow: summary.referringDomainsNofollow,
    referringMainDomains: summary.referringMainDomains,
    referringIps: summary.referringIps,
    brokenBacklinks: summary.brokenBacklinks,
    spamScore: summary.spamScore,
    firstSeen: summary.firstSeen,
  };
}

function top10(metrics: DomainRankMetrics): number {
  return metrics.positions
    .filter((bucket) => bucket.to <= 10)
    .reduce((sum, bucket) => sum + bucket.keywords, 0);
}

/**
 * Domain overview (docs/backend.md, "Domain overview and backlinks"): organic metrics,
 * history, top keywords and competitors from DataForSEO Labs, and the backlink summary. Each
 * part is cached for all workspaces; only missing parts are paid for.
 */
@Injectable()
export class DomainOverviewService {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly cache: ProviderCacheService,
    private readonly usage: UsageService,
  ) {}

  async quote(input: DomainOverviewRequest, now = new Date()): Promise<DomainOverviewQuote> {
    const target = domainTarget(input.domain);
    const params = this.params(target, input, now);
    const cached = await Promise.all(
      PARTS.map((part) => this.cache.has(OPERATIONS[part], params[part], now)),
    );
    const missing = PARTS.filter((_, index) => !cached[index]);
    return {
      domain: target,
      cached: missing.length === 0,
      estimatedCostUsd: roundUsd(missing.reduce((sum, part) => sum + ESTIMATES[part], 0)),
    };
  }

  async overview(
    workspaceId: string,
    input: DomainOverviewRequest,
    now = new Date(),
  ): Promise<DomainOverview> {
    const target = domainTarget(input.domain);
    const params = this.params(target, input, now);
    const loaded: Partial<{ [P in Part]: Loaded<CachedValues[P]> }> = {};
    const hits = await Promise.all(
      PARTS.map((part) => this.cache.get(OPERATIONS[part], params[part], CACHED[part], now)),
    );
    for (const [index, hit] of hits.entries()) {
      if (!hit) continue;
      (loaded as Record<Part, Loaded<unknown>>)[PARTS[index] as Part] = {
        value: hit.value,
        fetchedAt: hit.fetchedAt,
        cached: true,
        costUsd: 0,
      };
    }

    const missing = PARTS.filter((part) => !loaded[part]);
    if (missing.length > 0) {
      const client = await this.credentials.dataForSeoClient(workspaceId);
      await this.usage.assertCanSpend(
        workspaceId,
        missing.reduce((sum, part) => sum + ESTIMATES[part], 0),
      );
      // Parts that succeed are cached and billed even when another fails, so trying again
      // only pays for the rest.
      const results = await Promise.allSettled(
        missing.map((part) => this.fetchPart(client, part, target, input, params)),
      );
      for (const [index, result] of results.entries()) {
        const part = missing[index] as Part;
        if (result.status === "rejected") continue;
        await this.cache.set(
          {
            provider: "DATAFORSEO",
            operation: OPERATIONS[part],
            params: params[part],
            value: result.value.value,
            costUsd: result.value.cost,
            ttlDays: TTL_DAYS,
          },
          now,
        );
        await this.usage.record({
          workspaceId,
          provider: "DATAFORSEO",
          operation: OPERATIONS[part].split("@")[0] as string,
          units: result.value.units,
          costUsd: result.value.cost,
        });
        (loaded as Record<Part, Loaded<unknown>>)[part] = {
          value: result.value.value,
          fetchedAt: now,
          cached: false,
          costUsd: result.value.cost,
        };
      }
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw providerProblem((failure as PromiseRejectedResult).reason);
    }

    const all = loaded as { [P in Part]: Loaded<CachedValues[P]> };
    const labs = [all.rank, all.history, all.keywords, all.competitors];
    return {
      domain: target,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      organic: all.rank.value.organic,
      history: all.history.value.history,
      topKeywords: all.keywords.value.items,
      competitors: all.competitors.value.items,
      backlinks: all.backlinks.value.profile,
      sources: {
        labs: {
          fetchedAt: new Date(
            Math.min(...labs.map((part) => part.fetchedAt.getTime())),
          ).toISOString(),
          cached: labs.every((part) => part.cached),
        },
        backlinks: {
          fetchedAt: all.backlinks.fetchedAt.toISOString(),
          cached: all.backlinks.cached,
        },
      },
      costUsd: roundUsd(PARTS.reduce((sum, part) => sum + all[part].costUsd, 0)),
    };
  }

  /** Cache parameters of each part. */
  private params(target: string, input: DomainOverviewRequest, now: Date): Record<Part, object> {
    const market = {
      target,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
    };
    return {
      rank: market,
      // The current month and the ones before it, `historyMonths` in all.
      history: {
        ...market,
        from: monthsBefore(now, DOMAIN_OVERVIEW_LIMITS.historyMonths - 1),
      },
      keywords: { ...market, limit: DOMAIN_OVERVIEW_LIMITS.keywords },
      competitors: { ...market, limit: DOMAIN_OVERVIEW_LIMITS.competitors },
      backlinks: { target },
    };
  }

  private async fetchPart(
    client: DataForSeoClient,
    part: Part,
    target: string,
    input: DomainOverviewRequest,
    params: Record<Part, object>,
  ): Promise<{ value: CachedValues[Part]; cost: number; units: number }> {
    const market = { target, locationCode: input.locationCode, languageCode: input.languageCode };
    switch (part) {
      case "rank": {
        const response = await getDomainRankOverview(client, market);
        return { value: { organic: response.organic }, cost: response.cost, units: 1 };
      }
      case "history": {
        const { from } = params.history as { from: string };
        const response = await getHistoricalRankOverview(client, { ...market, dateFrom: from });
        const history = response.months.flatMap((month) =>
          month.organic
            ? [
                {
                  month: `${month.year}-${String(month.month).padStart(2, "0")}-01`,
                  keywords: month.organic.keywords,
                  traffic: month.organic.traffic,
                  top10: top10(month.organic),
                },
              ]
            : [],
        );
        return { value: { history }, cost: response.cost, units: history.length };
      }
      case "keywords": {
        const response = await getRankedKeywords(client, {
          ...market,
          limit: DOMAIN_OVERVIEW_LIMITS.keywords,
        });
        const items = response.items.map((item) => ({
          keyword: item.keyword,
          searchVolume: item.searchVolume === null ? null : Math.round(item.searchVolume),
          cpc: item.cpc,
          keywordDifficulty: item.keywordDifficulty,
          intent: item.intent,
          position: item.position,
          change:
            item.previousRankAbsolute !== null && item.rankAbsolute !== null && !item.isNew
              ? item.previousRankAbsolute - item.rankAbsolute
              : null,
          isNew: item.isNew,
          url: item.url,
          traffic: item.traffic,
        }));
        return { value: { items }, cost: response.cost, units: items.length };
      }
      case "competitors": {
        const response = await getCompetitorsDomain(client, {
          ...market,
          limit: DOMAIN_OVERVIEW_LIMITS.competitors,
        });
        const items = response.items.map((item) => ({
          domain: item.domain,
          commonKeywords: item.commonKeywords,
          avgPosition: item.avgPosition,
          keywords: item.organic?.keywords ?? null,
          traffic: item.organic?.traffic ?? null,
        }));
        return { value: { items }, cost: response.cost, units: items.length };
      }
      case "backlinks": {
        const response = await getBacklinksSummary(client, { target, includeSubdomains: true });
        return {
          value: { profile: toProfile(response.summary) },
          cost: response.cost,
          units: 1,
        };
      }
    }
  }
}
