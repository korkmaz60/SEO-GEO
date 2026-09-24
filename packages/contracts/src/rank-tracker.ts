import { z } from "zod";

import { DeviceSchema } from "./domain.js";
import { LanguageCodeSchema, LocationCodeSchema } from "./projects.js";

/** A calendar day, `YYYY-MM-DD`. */
export const IsoDateSchema = z.iso.date();

export const SearchIntentSchema = z.enum([
  "informational",
  "navigational",
  "commercial",
  "transactional",
]);
export type SearchIntent = z.infer<typeof SearchIntentSchema>;

export const RankFrequencySchema = z.enum(["DAILY", "WEEKLY"]);
export type RankFrequency = z.infer<typeof RankFrequencySchema>;

/** Most keywords accepted in one request. */
export const MAX_KEYWORDS_PER_REQUEST = 1000;
/** Most keywords one project can track. */
export const MAX_TRACKED_KEYWORDS_PER_PROJECT = 5000;
/** Results checked per keyword; a keyword below this depth counts as not ranking. */
export const RANK_TRACKING_DEPTH = 30;
/** How many days of history the rank tracker returns at most. */
export const MAX_RANK_HISTORY_DAYS = 180;

const TagSchema = z.string().trim().min(1).max(40);
const TargetUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);

export const TrackKeywordsSchema = z.strictObject({
  /** Raw keywords; they are normalized, and duplicates and invalid ones are skipped. */
  keywords: z.array(z.string().max(200)).min(1).max(MAX_KEYWORDS_PER_REQUEST),
  /** Default: the project's market and device. */
  locationCode: LocationCodeSchema.optional(),
  languageCode: LanguageCodeSchema.optional(),
  device: DeviceSchema.optional(),
  tags: z.array(TagSchema).max(10).default([]),
  frequency: RankFrequencySchema.default("DAILY"),
});
export type TrackKeywordsInput = z.input<typeof TrackKeywordsSchema>;
export type TrackKeywords = z.output<typeof TrackKeywordsSchema>;

export const KeywordProblemSchema = z.enum(["empty", "too_long", "too_many_words"]);

/** What adding keywords would do and cost, before anything is saved. */
export const TrackKeywordsQuoteSchema = z.object({
  /** Normalized keywords that would be added. */
  keywords: z.array(z.string()),
  /** Already tracked with the same market and device. */
  duplicates: z.int(),
  invalid: z.array(z.object({ keyword: z.string(), problem: KeywordProblemSchema })),
  /** Cost of checking the new keywords once, upper bound in USD. */
  checkCostUsd: z.number(),
  /** Expected cost of 30 days of checks at the chosen frequency. */
  monthlyCostUsd: z.number(),
  /** One-time cost of fetching search volume and difficulty for keywords without data. */
  metricsCostUsd: z.number(),
});
export type TrackKeywordsQuote = z.infer<typeof TrackKeywordsQuoteSchema>;

export const TrackKeywordsResultSchema = z.object({
  added: z.int(),
  duplicates: z.int(),
  invalid: z.int(),
});
export type TrackKeywordsResult = z.infer<typeof TrackKeywordsResultSchema>;

export const UpdateTrackedKeywordSchema = z
  .strictObject({
    tags: z.array(TagSchema).max(10),
    targetUrl: TargetUrlSchema.nullable(),
    frequency: RankFrequencySchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdateTrackedKeyword = z.output<typeof UpdateTrackedKeywordSchema>;

export const DeleteTrackedKeywordsSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(MAX_KEYWORDS_PER_REQUEST),
});
export type DeleteTrackedKeywords = z.output<typeof DeleteTrackedKeywordsSchema>;

export const RankHistoryQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(MAX_RANK_HISTORY_DAYS).default(30),
});

export const KeywordMetricsSchema = z.object({
  searchVolume: z.int().nullable(),
  keywordDifficulty: z.int().nullable(),
  cpc: z.number().nullable(),
  intent: SearchIntentSchema.nullable(),
  /** When the metrics were fetched. */
  fetchedAt: z.iso.datetime(),
});
export type KeywordMetrics = z.infer<typeof KeywordMetricsSchema>;

export const RankCheckStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);
export type RankCheckStatus = z.infer<typeof RankCheckStatusSchema>;

/** The most recent completed check of a keyword. */
export const LatestRankSchema = z.object({
  checkedOn: IsoDateSchema,
  /** Best organic position; `null` means not in the top `depth` results. */
  position: z.int().nullable(),
  url: z.string().nullable(),
  depth: z.int(),
  serpFeatures: z.array(z.string()),
  ownedFeatures: z.array(z.string()),
  aiOverviewPresent: z.boolean(),
  aiOverviewCited: z.boolean(),
});
export type LatestRank = z.infer<typeof LatestRankSchema>;

/** Position then and now; `null` positions mean not ranking. */
export const RankChangeSchema = z
  .object({ from: z.int().nullable(), to: z.int().nullable() })
  .nullable();
export type RankChange = z.infer<typeof RankChangeSchema>;

export const RankPointSchema = z.object({
  date: IsoDateSchema,
  position: z.int().nullable(),
});
export type RankPoint = z.infer<typeof RankPointSchema>;

export const TrackedKeywordSchema = z.object({
  id: z.uuid(),
  keyword: z.string(),
  locationCode: z.int(),
  languageCode: z.string(),
  device: DeviceSchema,
  tags: z.array(z.string()),
  targetUrl: z.string().nullable(),
  frequency: RankFrequencySchema,
  createdAt: z.iso.datetime(),
  metrics: KeywordMetricsSchema.nullable(),
  latest: LatestRankSchema.nullable(),
  /** A check is waiting for its SERP. */
  pending: z.boolean(),
  /** The last check failed and no newer one exists. */
  failed: z.boolean(),
  /** Against the previous check, and the checks about a week and a month earlier. */
  changes: z.object({
    previous: RankChangeSchema,
    week: RankChangeSchema,
    month: RankChangeSchema,
  }),
  /** Completed checks in the requested window, oldest first. */
  history: z.array(RankPointSchema),
  /** Latest positions of competitors: brand entity ID → position (`null`: not ranking). */
  competitors: z.record(z.string(), z.int().nullable()),
});
export type TrackedKeyword = z.infer<typeof TrackedKeywordSchema>;

export const VisibilityPointSchema = z.object({
  date: IsoDateSchema,
  visibility: z.number(),
  averagePosition: z.number().nullable(),
  keywords: z.int(),
});
export type VisibilityPoint = z.infer<typeof VisibilityPointSchema>;

export const RankTrackerSummarySchema = z.object({
  tracked: z.int(),
  /** Keywords with a completed check. */
  checked: z.int(),
  ranking: z.int(),
  top3: z.int(),
  top10: z.int(),
  /** Visibility in percent (CTR-weighted, see packages/core). */
  visibility: z.number(),
  estimatedTraffic: z.int(),
  averagePosition: z.number().nullable(),
  /** Keywords that moved up or down since the previous check. */
  improved: z.int(),
  declined: z.int(),
  aiOverviews: z.int(),
  aiOverviewCitations: z.int(),
  pendingChecks: z.int(),
  lastCheckedOn: IsoDateSchema.nullable(),
  history: z.array(VisibilityPointSchema),
  /** Own brand and competitors over the tracked keywords. */
  shareOfVoice: z.array(
    z.object({
      entityId: z.uuid(),
      name: z.string(),
      kind: z.enum(["OWN", "COMPETITOR"]),
      colorSlot: z.int(),
      visibility: z.number(),
      ranking: z.int(),
    }),
  ),
});
export type RankTrackerSummary = z.infer<typeof RankTrackerSummarySchema>;

export const RankTrackerDataSchema = z.object({
  summary: RankTrackerSummarySchema,
  keywords: z.array(TrackedKeywordSchema),
  /** Whether the workspace has working DataForSEO credentials. */
  providerReady: z.boolean(),
});
export type RankTrackerData = z.infer<typeof RankTrackerDataSchema>;

export const SerpResultRowSchema = z.object({
  position: z.int(),
  domain: z.string().nullable(),
  url: z.string().nullable(),
  title: z.string().nullable(),
  /** Brand entity the result belongs to, if any. */
  entityId: z.uuid().nullable(),
});
export type SerpResultRow = z.infer<typeof SerpResultRowSchema>;

export const KeywordDetailSchema = z.object({
  keyword: TrackedKeywordSchema,
  /** Daily positions of the own site and each competitor. */
  history: z.array(
    z.object({
      date: IsoDateSchema,
      position: z.int().nullable(),
      url: z.string().nullable(),
      competitors: z.record(z.string(), z.int().nullable()),
    }),
  ),
  /** The latest SERP, when its snapshot is still kept. */
  serp: z
    .object({
      fetchedAt: z.iso.datetime(),
      checkUrl: z.string().nullable(),
      itemTypes: z.array(z.string()),
      results: z.array(SerpResultRowSchema),
      aiOverview: z
        .object({
          references: z.array(
            z.object({
              domain: z.string().nullable(),
              url: z.string().nullable(),
              title: z.string().nullable(),
              entityId: z.uuid().nullable(),
            }),
          ),
        })
        .nullable(),
    })
    .nullable(),
});
export type KeywordDetail = z.infer<typeof KeywordDetailSchema>;
