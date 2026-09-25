import { z } from "zod";

import type { DataForSeoClient } from "../client.js";
import type { LabsMarket, SearchIntent } from "./labs.js";
import { SEARCH_INTENTS } from "./labs.js";
import { compact, parseResponse, toIsoDateTime } from "./shared.js";

// DataForSEO Labs, Google, domain endpoints (Live). Field names follow the official DataForSEO
// client (dataforseo-client 2.1.7: DataforseoLabsGoogleDomainRankOverviewLiveItem,
// DataforseoLabsMetricsInfo, DataforseoLabsGoogleHistoricalRankOverviewLiveItem,
// DataforseoLabsGoogleRankedKeywordsLiveItem, RankedSerpElement, DataLabsOrganicSerpElementItem,
// RankChanges, DataforseoLabsGoogleCompetitorsDomainLiveItem).

const BASE = "/dataforseo_labs/google";
export const LABS_DOMAIN_RANK_OVERVIEW_PATH = `${BASE}/domain_rank_overview/live`;
export const LABS_HISTORICAL_RANK_OVERVIEW_PATH = `${BASE}/historical_rank_overview/live`;
export const LABS_RANKED_KEYWORDS_PATH = `${BASE}/ranked_keywords/live`;
export const LABS_COMPETITORS_DOMAIN_PATH = `${BASE}/competitors_domain/live`;

/** A domain or subdomain without scheme and `www.`, in a market. */
export interface LabsDomainRequest extends LabsMarket {
  target: string;
}

/** Keywords whose best result of the domain is in a range of positions. */
export interface PositionBucket {
  from: number;
  to: number;
  keywords: number;
}

/** Ranking metrics of a domain in one market (organic or paid), normalized. */
export interface DomainRankMetrics {
  /** Keywords the domain ranks for (top 100). */
  keywords: number;
  /** Estimated monthly traffic from those keywords (DataForSEO's `etv`). */
  traffic: number;
  /** What that traffic would cost as ads, in USD per month. */
  trafficCostUsd: number;
  /** By position, best first; the buckets DataForSEO reports. */
  positions: PositionBucket[];
  newKeywords: number;
  upKeywords: number;
  downKeywords: number;
  lostKeywords: number;
}

export interface MonthlyDomainMetrics {
  year: number;
  month: number;
  organic: DomainRankMetrics | null;
}

/** A keyword a domain ranks for, with its best organic result. */
export interface RankedKeyword {
  keyword: string;
  searchVolume: number | null;
  cpc: number | null;
  keywordDifficulty: number | null;
  intent: SearchIntent | null;
  /** Organic position (`rank_group`). */
  position: number;
  /** Position among all SERP elements. */
  rankAbsolute: number | null;
  url: string | null;
  /** Estimated monthly traffic from this keyword. */
  traffic: number | null;
  /** Absolute rank a month earlier; `null` when new or unknown. */
  previousRankAbsolute: number | null;
  isNew: boolean;
  /** When DataForSEO last saw the SERP (ISO 8601). */
  updatedAt: string | null;
}

export interface DomainCompetitor {
  domain: string;
  /** Keywords both domains rank for. */
  commonKeywords: number;
  avgPosition: number | null;
  /** The competitor's own organic metrics in the market. */
  organic: DomainRankMetrics | null;
}

// ── Response schemas ────────────────────────────────────────────────────────────────

const count = z.number().nullish();

/** `DataforseoLabsMetricsInfo`: positions `pos_1` … `pos_91_100` and totals. */
const MetricsSchema = z.looseObject({
  pos_1: count,
  pos_2_3: count,
  pos_4_10: count,
  pos_11_20: count,
  pos_21_30: count,
  pos_31_40: count,
  pos_41_50: count,
  pos_51_60: count,
  pos_61_70: count,
  pos_71_80: count,
  pos_81_90: count,
  pos_91_100: count,
  etv: count,
  count,
  estimated_paid_traffic_cost: count,
  is_new: count,
  is_up: count,
  is_down: count,
  is_lost: count,
});
type MetricsRecord = z.infer<typeof MetricsSchema>;

const MetricsBundleSchema = z
  .looseObject({ organic: MetricsSchema.nullish(), paid: MetricsSchema.nullish() })
  .nullish();

const BUCKETS: [keyof MetricsRecord, number, number][] = [
  ["pos_1", 1, 1],
  ["pos_2_3", 2, 3],
  ["pos_4_10", 4, 10],
  ["pos_11_20", 11, 20],
  ["pos_21_30", 21, 30],
  ["pos_31_40", 31, 40],
  ["pos_41_50", 41, 50],
  ["pos_51_60", 51, 60],
  ["pos_61_70", 61, 70],
  ["pos_71_80", 71, 80],
  ["pos_81_90", 81, 90],
  ["pos_91_100", 91, 100],
];

function toMetrics(record: MetricsRecord | null | undefined): DomainRankMetrics | null {
  if (!record) return null;
  const number = (value: number | null | undefined) => value ?? 0;
  return {
    keywords: Math.round(number(record.count)),
    traffic: number(record.etv),
    trafficCostUsd: number(record.estimated_paid_traffic_cost),
    positions: BUCKETS.map(([key, from, to]) => ({
      from,
      to,
      keywords: Math.round(number(record[key] as number | null | undefined)),
    })),
    newKeywords: Math.round(number(record.is_new)),
    upKeywords: Math.round(number(record.is_up)),
    downKeywords: Math.round(number(record.is_down)),
    lostKeywords: Math.round(number(record.is_lost)),
  };
}

const RankOverviewResultSchema = z.looseObject({
  items: z.array(z.looseObject({ metrics: MetricsBundleSchema })).nullish(),
});

const HistoryResultSchema = z.looseObject({
  items: z
    .array(z.looseObject({ year: z.number(), month: z.number(), metrics: MetricsBundleSchema }))
    .nullish(),
});

const RankedKeywordsResultSchema = z.looseObject({
  total_count: count,
  items: z
    .array(
      z.looseObject({
        keyword_data: z.looseObject({
          keyword: z.string(),
          keyword_info: z
            .looseObject({
              search_volume: count,
              cpc: count,
              last_updated_time: z.string().nullish(),
            })
            .nullish(),
          keyword_properties: z.looseObject({ keyword_difficulty: count }).nullish(),
          search_intent_info: z.looseObject({ main_intent: z.string().nullish() }).nullish(),
        }),
        ranked_serp_element: z
          .looseObject({
            serp_item: z
              .looseObject({
                type: z.string().nullish(),
                rank_group: count,
                rank_absolute: count,
                url: z.string().nullish(),
                etv: count,
                rank_changes: z
                  .looseObject({
                    previous_rank_absolute: count,
                    is_new: z.boolean().nullish(),
                  })
                  .nullish(),
              })
              .nullish(),
            last_updated_time: z.string().nullish(),
          })
          .nullish(),
      }),
    )
    .nullish(),
});

const CompetitorsResultSchema = z.looseObject({
  total_count: count,
  items: z
    .array(
      z.looseObject({
        domain: z.string(),
        avg_position: count,
        intersections: count,
        full_domain_metrics: MetricsBundleSchema,
      }),
    )
    .nullish(),
});

function intentOf(value: string | null | undefined): SearchIntent | null {
  return (SEARCH_INTENTS as readonly string[]).includes(value ?? "")
    ? (value as SearchIntent)
    : null;
}

function market(input: LabsDomainRequest) {
  return {
    target: input.target,
    location_code: input.locationCode,
    language_code: input.languageCode,
  };
}

// ── Endpoints ───────────────────────────────────────────────────────────────────────

/** Current organic and paid metrics of a domain in a market. */
export async function getDomainRankOverview(
  client: DataForSeoClient,
  input: LabsDomainRequest,
): Promise<{ organic: DomainRankMetrics | null; paid: DomainRankMetrics | null; cost: number }> {
  const path = LABS_DOMAIN_RANK_OVERVIEW_PATH;
  const { result, cost } = await client.postOne<unknown>(path, market(input));
  const data = result[0] ? parseResponse(RankOverviewResultSchema, result[0], path) : null;
  const metrics = data?.items?.[0]?.metrics;
  return { organic: toMetrics(metrics?.organic), paid: toMetrics(metrics?.paid), cost };
}

/** Organic metrics by month since `dateFrom` (YYYY-MM-DD), oldest first. */
export async function getHistoricalRankOverview(
  client: DataForSeoClient,
  input: LabsDomainRequest & { dateFrom?: string },
): Promise<{ months: MonthlyDomainMetrics[]; cost: number }> {
  const path = LABS_HISTORICAL_RANK_OVERVIEW_PATH;
  const { result, cost } = await client.postOne<unknown>(
    path,
    compact({ ...market(input), date_from: input.dateFrom }),
  );
  const data = result[0] ? parseResponse(HistoryResultSchema, result[0], path) : null;
  const months = (data?.items ?? [])
    .map((item) => ({
      year: item.year,
      month: item.month,
      organic: toMetrics(item.metrics?.organic),
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
  return { months, cost };
}

/** Organic keywords of a domain, by estimated traffic (most first). */
export async function getRankedKeywords(
  client: DataForSeoClient,
  input: LabsDomainRequest & { limit: number },
): Promise<{ totalCount: number; items: RankedKeyword[]; cost: number }> {
  const path = LABS_RANKED_KEYWORDS_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    ...market(input),
    item_types: ["organic"],
    limit: input.limit,
    order_by: ["ranked_serp_element.serp_item.etv,desc"],
  });
  const data = result[0] ? parseResponse(RankedKeywordsResultSchema, result[0], path) : null;
  const items: RankedKeyword[] = [];
  for (const item of data?.items ?? []) {
    const element = item.ranked_serp_element;
    const serp = element?.serp_item;
    if (!serp || typeof serp.rank_group !== "number") continue;
    const info = item.keyword_data.keyword_info;
    items.push({
      keyword: item.keyword_data.keyword,
      searchVolume: info?.search_volume ?? null,
      cpc: info?.cpc ?? null,
      keywordDifficulty: item.keyword_data.keyword_properties?.keyword_difficulty ?? null,
      intent: intentOf(item.keyword_data.search_intent_info?.main_intent),
      position: serp.rank_group,
      rankAbsolute: serp.rank_absolute ?? null,
      url: serp.url ?? null,
      traffic: serp.etv ?? null,
      previousRankAbsolute: serp.rank_changes?.previous_rank_absolute ?? null,
      isNew: serp.rank_changes?.is_new ?? false,
      updatedAt: toIsoDateTime(element?.last_updated_time),
    });
  }
  return { totalCount: Math.round(data?.total_count ?? items.length), items, cost };
}

/**
 * Domains that rank for the same keywords, most shared keywords first. The target itself,
 * which DataForSEO may list, is left out.
 */
export async function getCompetitorsDomain(
  client: DataForSeoClient,
  input: LabsDomainRequest & { limit: number },
): Promise<{ totalCount: number; items: DomainCompetitor[]; cost: number }> {
  const path = LABS_COMPETITORS_DOMAIN_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    ...market(input),
    // One more, in case the target is among them.
    limit: input.limit + 1,
    exclude_top_domains: true,
    order_by: ["intersections,desc"],
  });
  const data = result[0] ? parseResponse(CompetitorsResultSchema, result[0], path) : null;
  const target = input.target.toLowerCase();
  const items = (data?.items ?? [])
    .filter((item) => item.domain.toLowerCase() !== target)
    .slice(0, input.limit)
    .map((item) => ({
      domain: item.domain,
      commonKeywords: Math.round(item.intersections ?? 0),
      avgPosition: item.avg_position ?? null,
      organic: toMetrics(item.full_domain_metrics?.organic),
    }));
  return { totalCount: Math.round(data?.total_count ?? items.length), items, cost };
}
