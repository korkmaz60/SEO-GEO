import { HttpStatus, Injectable } from "@nestjs/common";
import {
  DOMAIN_OVERVIEW_LIMITS,
  DomainCompetitorSchema,
  DomainHistoryPointSchema,
  DomainKeywordSchema,
  DomainMetricsSchema,
  ErrorCode,
  type DomainOverview,
  type DomainOverviewQuote,
  type DomainOverviewRequest,
} from "@seo-geo/contracts";
import { normalizeHostname, stripWww } from "@seo-geo/core";
import {
  estimateLabsCost,
  getCompetitorsDomain,
  getDomainRankOverview,
  getHistoricalRankOverview,
  getRankedKeywords,
  type DomainRankMetrics,
} from "@seo-geo/dataforseo";
import { z } from "zod";

import { monthsBefore, summaryPart } from "../backlinks/backlink-parts.js";
import { ProblemException } from "../common/problem.exception.js";
import {
  CachedPartsService,
  costOf,
  sourceOf,
  type ProviderPart,
} from "../providers/cached-parts.service.js";

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

function top10(metrics: DomainRankMetrics): number {
  return metrics.positions
    .filter((bucket) => bucket.to <= 10)
    .reduce((sum, bucket) => sum + bucket.keywords, 0);
}

const RankValueSchema = z.object({ organic: DomainMetricsSchema.nullable() });
const HistoryValueSchema = z.object({ history: z.array(DomainHistoryPointSchema) });
const KeywordsValueSchema = z.object({ items: z.array(DomainKeywordSchema) });
const CompetitorsValueSchema = z.object({ items: z.array(DomainCompetitorSchema) });

/**
 * The requests an overview is made of, each cached on its own: Labs data in the market and
 * the backlink summary, which the project backlinks page shares.
 */
function overviewParts(target: string, input: DomainOverviewRequest, now: Date) {
  const market = { target, locationCode: input.locationCode, languageCode: input.languageCode };
  // The current month and the ones before it, `historyMonths` in all.
  const from = monthsBefore(now, DOMAIN_OVERVIEW_LIMITS.historyMonths - 1);
  const rank: ProviderPart<z.infer<typeof RankValueSchema>> = {
    operation: "labs.domain_rank_overview@1",
    params: market,
    schema: RankValueSchema,
    estimateUsd: estimateLabsCost({ items: 1 }),
    fetch: async (client) => {
      const response = await getDomainRankOverview(client, market);
      return { value: { organic: response.organic }, cost: response.cost, units: 1 };
    },
  };
  const history: ProviderPart<z.infer<typeof HistoryValueSchema>> = {
    operation: "labs.historical_rank_overview@1",
    params: { ...market, from },
    schema: HistoryValueSchema,
    estimateUsd: estimateLabsCost({ items: DOMAIN_OVERVIEW_LIMITS.historyMonths }),
    fetch: async (client) => {
      const response = await getHistoricalRankOverview(client, { ...market, dateFrom: from });
      const points = response.months.flatMap((month) =>
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
      return { value: { history: points }, cost: response.cost, units: points.length };
    },
  };
  const keywords: ProviderPart<z.infer<typeof KeywordsValueSchema>> = {
    operation: "labs.ranked_keywords@1",
    params: { ...market, limit: DOMAIN_OVERVIEW_LIMITS.keywords },
    schema: KeywordsValueSchema,
    estimateUsd: estimateLabsCost({ items: DOMAIN_OVERVIEW_LIMITS.keywords }),
    fetch: async (client) => {
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
    },
  };
  const competitors: ProviderPart<z.infer<typeof CompetitorsValueSchema>> = {
    operation: "labs.competitors_domain@1",
    params: { ...market, limit: DOMAIN_OVERVIEW_LIMITS.competitors },
    schema: CompetitorsValueSchema,
    // One more competitor is requested, in case the domain itself is listed.
    estimateUsd: estimateLabsCost({ items: DOMAIN_OVERVIEW_LIMITS.competitors + 1 }),
    fetch: async (client) => {
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
    },
  };
  const backlinks = summaryPart({ target, includeSubdomains: true });
  return { rank, history, keywords, competitors, backlinks };
}

/**
 * Domain overview (docs/backend.md, "Domain overview and backlinks"): organic metrics,
 * history, top keywords and competitors from DataForSEO Labs, and the backlink summary. Each
 * part is cached for all workspaces for 7 days; only missing parts are paid for, and a refresh
 * loads all of them again (D23).
 */
@Injectable()
export class DomainOverviewService {
  constructor(private readonly parts: CachedPartsService) {}

  async quote(input: DomainOverviewRequest, now = new Date()): Promise<DomainOverviewQuote> {
    const target = domainTarget(input.domain);
    const quote = await this.parts.quote(overviewParts(target, input, now), {
      refresh: input.refresh,
      now,
    });
    return { domain: target, ...quote };
  }

  async overview(
    workspaceId: string,
    input: DomainOverviewRequest,
    now = new Date(),
  ): Promise<DomainOverview> {
    const target = domainTarget(input.domain);
    const parts = await this.parts.load(workspaceId, overviewParts(target, input, now), {
      refresh: input.refresh,
      now,
    });
    const { rank, history, keywords, competitors, backlinks } = parts;
    return {
      domain: target,
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      organic: rank.value.organic,
      history: history.value.history,
      topKeywords: keywords.value.items,
      competitors: competitors.value.items,
      backlinks: backlinks.value.profile,
      sources: {
        labs: sourceOf([rank, history, keywords, competitors]),
        backlinks: sourceOf([backlinks]),
      },
      costUsd: costOf(Object.values(parts)),
    };
  }
}
