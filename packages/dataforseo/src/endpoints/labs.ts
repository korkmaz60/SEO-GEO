import { z } from "zod";

import type { DataForSeoClient } from "../client.js";
import { compact, parseResponse, toIsoDateTime } from "./shared.js";

// DataForSEO Labs, Google, Live endpoints. Field names follow the official DataForSEO client
// (dataforseo-client 2.x: DataforseoLabsGoogleKeywordIdeasLiveRequestInfo, KeywordDataInfo,
// KeywordInfo, KeywordProperties, SearchIntentInfo, SerpInfo, …RelatedKeywordsLiveItem).

const BASE = "/dataforseo_labs/google";
export const LABS_KEYWORD_IDEAS_PATH = `${BASE}/keyword_ideas/live`;
export const LABS_KEYWORD_SUGGESTIONS_PATH = `${BASE}/keyword_suggestions/live`;
export const LABS_RELATED_KEYWORDS_PATH = `${BASE}/related_keywords/live`;
export const LABS_KEYWORD_OVERVIEW_PATH = `${BASE}/keyword_overview/live`;

/** Request limits documented by DataForSEO. */
export const LABS_LIMITS = {
  ideaSeeds: 200,
  overviewKeywords: 700,
  maxLimit: 1000,
  maxRelatedDepth: 4,
} as const;

export const SEARCH_INTENTS = [
  "informational",
  "navigational",
  "commercial",
  "transactional",
] as const;
export type SearchIntent = (typeof SEARCH_INTENTS)[number];

export const COMPETITION_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type CompetitionLevel = (typeof COMPETITION_LEVELS)[number];

export interface LabsMarket {
  locationCode: number;
  languageCode: string;
}

export interface MonthlySearches {
  year: number;
  month: number;
  searchVolume: number | null;
}

/** Keyword metrics from DataForSEO Labs, normalized. */
export interface KeywordData {
  keyword: string;
  /** Average monthly searches over the last 12 months. */
  searchVolume: number | null;
  /** Average cost per click in USD. */
  cpc: number | null;
  /** Paid competition, 0–1. */
  competition: number | null;
  competitionLevel: CompetitionLevel | null;
  /** Chance of reaching the top 10, 0–100 (logarithmic). */
  keywordDifficulty: number | null;
  intent: SearchIntent | null;
  secondaryIntents: SearchIntent[];
  /** Oldest month first. */
  monthlySearches: MonthlySearches[];
  /** Search volume change in percent. */
  trend: { monthly: number | null; quarterly: number | null; yearly: number | null } | null;
  /** SERP element types; only when requested with `includeSerpInfo`. */
  serpItemTypes: string[] | null;
  resultsCount: number | null;
  wordsCount: number | null;
  /** Main keyword of the synonym group this keyword belongs to. */
  coreKeyword: string | null;
  /** When DataForSEO last updated the metrics (ISO 8601). */
  updatedAt: string | null;
}

// ── Response schemas ────────────────────────────────────────────────────────────────

const nullableNumber = z.number().nullish();
const nullableString = z.string().nullish();

const KeywordInfoSchema = z.looseObject({
  last_updated_time: nullableString,
  competition: nullableNumber,
  competition_level: nullableString,
  cpc: nullableNumber,
  search_volume: nullableNumber,
  monthly_searches: z
    .array(z.looseObject({ year: z.number(), month: z.number(), search_volume: nullableNumber }))
    .nullish(),
  search_volume_trend: z
    .looseObject({ monthly: nullableNumber, quarterly: nullableNumber, yearly: nullableNumber })
    .nullish(),
});

const KeywordDataSchema = z.looseObject({
  keyword: z.string(),
  keyword_info: KeywordInfoSchema.nullish(),
  keyword_properties: z
    .looseObject({
      core_keyword: nullableString,
      keyword_difficulty: nullableNumber,
      words_count: nullableNumber,
    })
    .nullish(),
  search_intent_info: z
    .looseObject({ main_intent: nullableString, foreign_intent: z.array(z.string()).nullish() })
    .nullish(),
  serp_info: z
    .looseObject({
      serp_item_types: z.array(z.string()).nullish(),
      se_results_count: nullableNumber,
    })
    .nullish(),
});
type KeywordDataRecord = z.infer<typeof KeywordDataSchema>;

const ListResultSchema = z.looseObject({
  total_count: nullableNumber,
  offset: nullableNumber,
  offset_token: nullableString,
  items: z.array(KeywordDataSchema).nullish(),
});

const SeededListResultSchema = ListResultSchema.extend({
  seed_keyword_data: KeywordDataSchema.nullish(),
});

const RelatedResultSchema = z.looseObject({
  total_count: nullableNumber,
  seed_keyword_data: KeywordDataSchema.nullish(),
  items: z
    .array(
      z.looseObject({
        keyword_data: KeywordDataSchema,
        depth: nullableNumber,
        related_keywords: z.array(z.string()).nullish(),
      }),
    )
    .nullish(),
});

const OverviewResultSchema = z.looseObject({
  items: z.array(KeywordDataSchema).nullish(),
});

function isIntent(value: string): value is SearchIntent {
  return (SEARCH_INTENTS as readonly string[]).includes(value);
}

function toKeywordData(record: KeywordDataRecord): KeywordData {
  const info = record.keyword_info;
  const properties = record.keyword_properties;
  const intent = record.search_intent_info;
  const level = info?.competition_level ?? null;
  const main = intent?.main_intent ?? null;
  const trend = info?.search_volume_trend;
  return {
    keyword: record.keyword,
    searchVolume: info?.search_volume ?? null,
    cpc: info?.cpc ?? null,
    competition: info?.competition ?? null,
    competitionLevel:
      level && (COMPETITION_LEVELS as readonly string[]).includes(level)
        ? (level as CompetitionLevel)
        : null,
    keywordDifficulty: properties?.keyword_difficulty ?? null,
    intent: main && isIntent(main) ? main : null,
    secondaryIntents: (intent?.foreign_intent ?? []).filter(isIntent),
    monthlySearches: (info?.monthly_searches ?? [])
      .map((entry) => ({
        year: entry.year,
        month: entry.month,
        searchVolume: entry.search_volume ?? null,
      }))
      .sort((a, b) => a.year - b.year || a.month - b.month),
    trend: trend
      ? {
          monthly: trend.monthly ?? null,
          quarterly: trend.quarterly ?? null,
          yearly: trend.yearly ?? null,
        }
      : null,
    serpItemTypes: record.serp_info?.serp_item_types ?? null,
    resultsCount: record.serp_info?.se_results_count ?? null,
    wordsCount: properties?.words_count ?? null,
    coreKeyword: properties?.core_keyword ?? null,
    updatedAt: toIsoDateTime(info?.last_updated_time),
  };
}

// ── Endpoints ───────────────────────────────────────────────────────────────────────

interface ListOptions extends LabsMarket {
  /** Maximum rows to return (and pay for), 1–1000. Defaults to 100. */
  limit?: number;
  offset?: number;
  /** Add SERP element types and result counts to every row. */
  includeSerpInfo?: boolean;
  /** Leave out keywords that are near-duplicates of another keyword. */
  ignoreSynonyms?: boolean;
}

export interface KeywordList {
  /** Rows DataForSEO has for the request, beyond `limit`. */
  totalCount: number;
  items: KeywordData[];
  cost: number;
}

function listBody(options: ListOptions): Record<string, unknown> {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > LABS_LIMITS.maxLimit) {
    throw new RangeError(`limit must be an integer between 1 and ${LABS_LIMITS.maxLimit}`);
  }
  return compact({
    location_code: options.locationCode,
    language_code: options.languageCode,
    limit,
    offset: options.offset,
    include_serp_info: options.includeSerpInfo,
    ignore_synonyms: options.ignoreSynonyms,
  });
}

function seeds(keywords: readonly string[], max: number): string[] {
  const unique = [...new Set(keywords.map((keyword) => keyword.trim()).filter(Boolean))];
  if (unique.length === 0 || unique.length > max) {
    throw new RangeError(`Between 1 and ${max} keywords are required`);
  }
  return unique;
}

function seed(keyword: string): string {
  const trimmed = keyword.trim();
  if (!trimmed) throw new RangeError("A keyword is required");
  return trimmed;
}

/**
 * Keywords from the same product and service categories as the seeds ("broad" ideas),
 * ordered by relevance.
 */
export async function getKeywordIdeas(
  client: DataForSeoClient,
  options: ListOptions & { keywords: readonly string[] },
): Promise<KeywordList> {
  const path = LABS_KEYWORD_IDEAS_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    keywords: seeds(options.keywords, LABS_LIMITS.ideaSeeds),
    ...listBody(options),
  });
  const data = result[0] ? parseResponse(ListResultSchema, result[0], path) : null;
  return {
    totalCount: data?.total_count ?? 0,
    items: (data?.items ?? []).map(toKeywordData),
    cost,
  };
}

/** Long-tail keywords that contain the seed; DataForSEO orders them by search volume. */
export async function getKeywordSuggestions(
  client: DataForSeoClient,
  options: ListOptions & { keyword: string; includeSeedKeyword?: boolean },
): Promise<KeywordList & { seed: KeywordData | null }> {
  const path = LABS_KEYWORD_SUGGESTIONS_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    keyword: seed(options.keyword),
    ...listBody(options),
    include_seed_keyword: options.includeSeedKeyword,
  });
  const data = result[0] ? parseResponse(SeededListResultSchema, result[0], path) : null;
  return {
    totalCount: data?.total_count ?? 0,
    seed: data?.seed_keyword_data ? toKeywordData(data.seed_keyword_data) : null,
    items: (data?.items ?? []).map(toKeywordData),
    cost,
  };
}

export interface RelatedKeyword extends KeywordData {
  /** Search depth at which the keyword was found (1 = directly related to the seed). */
  depth: number | null;
  /** Searches Google lists as related to this keyword. */
  related: string[];
}

/**
 * Keywords from Google's "searches related to" graph around the seed, ordered by search
 * volume. Each depth level multiplies the results (up to 8, 72, 584, 4680 keywords).
 */
export async function getRelatedKeywords(
  client: DataForSeoClient,
  options: ListOptions & { keyword: string; depth?: number; includeSeedKeyword?: boolean },
): Promise<{
  totalCount: number;
  seed: KeywordData | null;
  items: RelatedKeyword[];
  cost: number;
}> {
  const depth = options.depth ?? 1;
  if (!Number.isInteger(depth) || depth < 0 || depth > LABS_LIMITS.maxRelatedDepth) {
    throw new RangeError(`depth must be an integer between 0 and ${LABS_LIMITS.maxRelatedDepth}`);
  }
  const path = LABS_RELATED_KEYWORDS_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    keyword: seed(options.keyword),
    ...listBody(options),
    depth,
    include_seed_keyword: options.includeSeedKeyword,
  });
  const data = result[0] ? parseResponse(RelatedResultSchema, result[0], path) : null;
  return {
    totalCount: data?.total_count ?? 0,
    seed: data?.seed_keyword_data ? toKeywordData(data.seed_keyword_data) : null,
    items: (data?.items ?? []).map((item) => ({
      ...toKeywordData(item.keyword_data),
      depth: item.depth ?? null,
      related: item.related_keywords ?? [],
    })),
    cost,
  };
}

/**
 * Metrics for known keywords (volume, CPC, difficulty, intent). Keywords DataForSEO has no
 * data for are left out of the result and are not billed.
 */
export async function getKeywordOverview(
  client: DataForSeoClient,
  options: LabsMarket & { keywords: readonly string[]; includeSerpInfo?: boolean },
): Promise<{ items: KeywordData[]; cost: number }> {
  const path = LABS_KEYWORD_OVERVIEW_PATH;
  const { result, cost } = await client.postOne<unknown>(
    path,
    compact({
      keywords: seeds(options.keywords, LABS_LIMITS.overviewKeywords),
      location_code: options.locationCode,
      language_code: options.languageCode,
      include_serp_info: options.includeSerpInfo,
    }),
  );
  const data = result[0] ? parseResponse(OverviewResultSchema, result[0], path) : null;
  return { items: (data?.items ?? []).map(toKeywordData), cost };
}
