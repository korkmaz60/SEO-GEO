import { z } from "zod";

import { LanguageCodeSchema, LocationCodeSchema } from "./projects.js";
import { KeywordMetricsSchema, SearchIntentSchema } from "./rank-tracker.js";

/**
 * - `ideas`: keywords from the same product and service categories as the seed;
 * - `suggestions`: long-tail keywords that contain the seed;
 * - `related`: Google's "searches related to" graph around the seed.
 */
export const ResearchModeSchema = z.enum(["ideas", "suggestions", "related"]);
export type ResearchMode = z.infer<typeof ResearchModeSchema>;

export const MAX_RESEARCH_LIMIT = 1000;

export const KeywordResearchSchema = z.strictObject({
  mode: ResearchModeSchema,
  keyword: z.string().trim().min(1).max(80),
  locationCode: LocationCodeSchema,
  languageCode: LanguageCodeSchema,
  /** Rows to fetch; each row is billed. */
  limit: z.int().min(10).max(MAX_RESEARCH_LIMIT).default(100),
});
export type KeywordResearchInput = z.input<typeof KeywordResearchSchema>;
export type KeywordResearch = z.output<typeof KeywordResearchSchema>;

export const KeywordResearchQuoteSchema = z.object({
  /** Upper bound in USD; 0 when the result is cached. */
  estimatedCostUsd: z.number(),
  cached: z.boolean(),
});
export type KeywordResearchQuote = z.infer<typeof KeywordResearchQuoteSchema>;

export const CompetitionLevelSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const ResearchKeywordSchema = z.object({
  keyword: z.string(),
  searchVolume: z.int().nullable(),
  cpc: z.number().nullable(),
  competition: z.number().nullable(),
  competitionLevel: CompetitionLevelSchema.nullable(),
  keywordDifficulty: z.number().nullable(),
  intent: SearchIntentSchema.nullable(),
  secondaryIntents: z.array(SearchIntentSchema),
  /** Oldest month first. */
  monthlySearches: z.array(
    z.object({ year: z.int(), month: z.int(), searchVolume: z.int().nullable() }),
  ),
  /** Search volume change in percent. */
  trend: z
    .object({
      monthly: z.number().nullable(),
      quarterly: z.number().nullable(),
      yearly: z.number().nullable(),
    })
    .nullable(),
});
export type ResearchKeyword = z.infer<typeof ResearchKeywordSchema>;

export const KeywordResearchResultSchema = z.object({
  mode: ResearchModeSchema,
  /** The normalized seed keyword. */
  keyword: z.string(),
  locationCode: z.int(),
  languageCode: z.string(),
  seed: ResearchKeywordSchema.nullable(),
  items: z.array(ResearchKeywordSchema),
  /** Rows the provider has beyond `limit`. */
  totalCount: z.int(),
  cached: z.boolean(),
  /** What this request cost; 0 for a cached result. */
  costUsd: z.number(),
  fetchedAt: z.iso.datetime(),
});
export type KeywordResearchResult = z.infer<typeof KeywordResearchResultSchema>;

// ── Keyword lists ─────────────────────────────────────────────────────────────────

export const MAX_KEYWORD_LIST_ITEMS = 5000;

const ListNameSchema = z.string().trim().min(1).max(80);

export const KeywordListItemInputSchema = z.strictObject({
  keyword: z.string().trim().min(1).max(80),
  locationCode: LocationCodeSchema,
  languageCode: LanguageCodeSchema,
});
export type KeywordListItemInput = z.infer<typeof KeywordListItemInputSchema>;

export const CreateKeywordListSchema = z.strictObject({
  name: ListNameSchema,
  items: z.array(KeywordListItemInputSchema).max(1000).default([]),
});
export type CreateKeywordList = z.output<typeof CreateKeywordListSchema>;

export const RenameKeywordListSchema = z.strictObject({ name: ListNameSchema });

export const KeywordListItemsSchema = z.strictObject({
  items: z.array(KeywordListItemInputSchema).min(1).max(1000),
});
export type KeywordListItems = z.output<typeof KeywordListItemsSchema>;

export const KeywordListSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  itemCount: z.int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type KeywordList = z.infer<typeof KeywordListSchema>;

export const KeywordListDetailSchema = KeywordListSchema.extend({
  items: z.array(
    z.object({
      keyword: z.string(),
      locationCode: z.int(),
      languageCode: z.string(),
      addedAt: z.iso.datetime(),
      metrics: KeywordMetricsSchema.nullable(),
    }),
  ),
});
export type KeywordListDetail = z.infer<typeof KeywordListDetailSchema>;
