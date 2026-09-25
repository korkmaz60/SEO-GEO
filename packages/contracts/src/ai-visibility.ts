import { z } from "zod";

import { BrandKindSchema, LanguageCodeSchema, LocationCodeSchema } from "./projects.js";
import { IsoDateSchema } from "./rank-tracker.js";

// ── Platforms and settings ──────────────────────────────────────────────────────────

export const AiPlatformSchema = z.enum([
  "CHATGPT",
  "GEMINI",
  "PERPLEXITY",
  "CLAUDE",
  "GOOGLE_AI_MODE",
  "GOOGLE_AI_OVERVIEW",
]);
export type AiPlatform = z.infer<typeof AiPlatformSchema>;
/** Every platform, in display order. */
export const AI_PLATFORMS = AiPlatformSchema.options;

/** How answers of a platform are obtained (see docs/geo-aeo.md). */
export type AiMethod = "llm_scraper" | "llm_responses" | "google_ai_mode" | "google_ai_overview";

export const AI_PLATFORM_METHODS: Record<AiPlatform, AiMethod> = {
  CHATGPT: "llm_scraper",
  GEMINI: "llm_scraper",
  PERPLEXITY: "llm_responses",
  CLAUDE: "llm_responses",
  GOOGLE_AI_MODE: "google_ai_mode",
  GOOGLE_AI_OVERVIEW: "google_ai_overview",
};

/** Platforms a new project asks: all but Claude, whose answers cost far more. */
export const DEFAULT_AI_PLATFORMS: AiPlatform[] = [
  "CHATGPT",
  "GEMINI",
  "PERPLEXITY",
  "GOOGLE_AI_MODE",
  "GOOGLE_AI_OVERVIEW",
];

/** Platforms reached through a model API, where the model can be chosen. */
export const MODEL_PLATFORMS = ["CLAUDE", "PERPLEXITY"] as const satisfies readonly AiPlatform[];
export const ModelPlatformSchema = z.enum(MODEL_PLATFORMS);
export type ModelPlatform = z.infer<typeof ModelPlatformSchema>;

/** DataForSEO LLM Responses accept prompts up to this length. */
export const MAX_PROMPT_LENGTH = 500;
export const MIN_PROMPT_LENGTH = 3;
export const MAX_PROMPTS_PER_REQUEST = 200;
export const MAX_PROMPTS_PER_PROJECT = 1000;
export const MAX_AI_SAMPLES = 5;

export const AiFrequencySchema = z.enum(["DAILY", "WEEKLY"]);
export type AiFrequency = z.infer<typeof AiFrequencySchema>;

const ModelNameSchema = z.string().trim().min(1).max(100);
const TagSchema = z.string().trim().min(1).max(40);

export const AiSettingsSchema = z.object({
  platforms: z.array(AiPlatformSchema),
  frequency: AiFrequencySchema,
  /** Answers per prompt, platform and period. */
  samples: z.int().min(1).max(MAX_AI_SAMPLES),
  /** Model per model-API platform; `null` uses the default model. */
  models: z.object({ CLAUDE: z.string().nullable(), PERPLEXITY: z.string().nullable() }),
  sentiment: z.boolean(),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

const SETTINGS_FIELDS = {
  platforms: z.array(AiPlatformSchema).max(AI_PLATFORMS.length),
  frequency: AiFrequencySchema,
  samples: z.int().min(1).max(MAX_AI_SAMPLES),
  /** `null` goes back to the default model. */
  models: z
    .strictObject({ CLAUDE: ModelNameSchema.nullable(), PERPLEXITY: ModelNameSchema.nullable() })
    .partial(),
  sentiment: z.boolean(),
};

export const UpdateAiSettingsSchema = z
  .strictObject(SETTINGS_FIELDS)
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdateAiSettings = z.output<typeof UpdateAiSettingsSchema>;

/** Settings to price (the saved ones where left out) and prompts about to be added. */
export const AiCostQuoteRequestSchema = z
  .strictObject({
    ...SETTINGS_FIELDS,
    additionalPrompts: z.int().min(0).max(MAX_PROMPTS_PER_PROJECT),
  })
  .partial();
export type AiCostQuoteRequest = z.output<typeof AiCostQuoteRequestSchema>;

export const AiCostQuoteSchema = z.object({
  /** Active prompts, including the ones about to be added. */
  prompts: z.int(),
  answersPerPeriod: z.int(),
  /** Upper-bound cost of one period (a day or a week), sentiment included. */
  perPeriodUsd: z.number(),
  /** Upper-bound cost of 30 days. */
  perMonthUsd: z.number(),
  platforms: z.array(
    z.object({
      platform: AiPlatformSchema,
      answers: z.int(),
      costUsd: z.number(),
      model: z.string().nullable(),
    }),
  ),
  /** Upper bound of classifying the tone of mentions in one period. */
  sentimentUsd: z.number(),
});
export type AiCostQuote = z.infer<typeof AiCostQuoteSchema>;

export const AiModelsSchema = z.object({
  platform: AiPlatformSchema,
  /** Models that can search the web, cheapest estimate first. */
  models: z.array(
    z.object({ name: z.string(), estimatedCostUsd: z.number(), isDefault: z.boolean() }),
  ),
});
export type AiModels = z.infer<typeof AiModelsSchema>;

// ── Prompts ─────────────────────────────────────────────────────────────────────────

export const CreatePromptsSchema = z.strictObject({
  /** One prompt per entry; blank and invalid entries are counted, not stored. */
  prompts: z.array(z.string().max(2000)).min(1).max(MAX_PROMPTS_PER_REQUEST),
  tags: z.array(TagSchema).max(10).default([]),
  /** The project's market by default. */
  locationCode: LocationCodeSchema.optional(),
  languageCode: LanguageCodeSchema.optional(),
});
export type CreatePromptsInput = z.input<typeof CreatePromptsSchema>;
export type CreatePrompts = z.output<typeof CreatePromptsSchema>;

export const CreatePromptsResultSchema = z.object({
  added: z.int(),
  duplicates: z.int(),
  /** Shorter than 3 or longer than 500 characters. */
  invalid: z.int(),
});
export type CreatePromptsResult = z.infer<typeof CreatePromptsResultSchema>;

export const CreatePromptsQuoteSchema = z.object({
  /** New prompts that would be added. */
  prompts: z.int(),
  duplicates: z.int(),
  invalid: z.int(),
  frequency: AiFrequencySchema,
  /** Upper-bound cost of asking the new prompts for one period (a day or a week). */
  perPeriodUsd: z.number(),
  /** Upper-bound cost of 30 days. */
  perMonthUsd: z.number(),
});
export type CreatePromptsQuote = z.infer<typeof CreatePromptsQuoteSchema>;

export const UpdatePromptSchema = z
  .strictObject({ tags: z.array(TagSchema).max(10), active: z.boolean() })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdatePrompt = z.output<typeof UpdatePromptSchema>;

export const DeletePromptsSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(MAX_PROMPTS_PER_REQUEST),
});

// ── Read models ─────────────────────────────────────────────────────────────────────

export const AI_RANGES = [7, 30, 90] as const;
export type AiRange = (typeof AI_RANGES)[number];

export const AiRangeQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => (AI_RANGES as readonly number[]).includes(value), "Use 7, 30 or 90")
    .default(30),
});

export const AiPromptsQuerySchema = AiRangeQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AiPromptsQuery = z.output<typeof AiPromptsQuerySchema>;

/** A proportion with its 95% Wilson interval. */
export const AiRateSchema = z.object({ value: z.number(), low: z.number(), high: z.number() });
export type AiRate = z.infer<typeof AiRateSchema>;

export const AiBrandSchema = z.object({
  entityId: z.uuid(),
  name: z.string(),
  kind: BrandKindSchema,
  colorSlot: z.int(),
});
export type AiBrand = z.infer<typeof AiBrandSchema>;

export const AiBrandStatsSchema = z.object({
  entityId: z.uuid(),
  /** Answers considered. */
  runs: z.int(),
  mentionRate: AiRateSchema.nullable(),
  citationRate: AiRateSchema.nullable(),
  /** Share of brand mentions among the tracked brands, 0–1. */
  shareOfVoice: z.number().nullable(),
  /** Mean first-mention rank when mentioned (1 = first). */
  averageRank: z.number().nullable(),
  /** AI visibility score, 0–100. */
  score: z.number().nullable(),
  /** Fewer than 20 answers: read with care. */
  lowSample: z.boolean(),
});
export type AiBrandStats = z.infer<typeof AiBrandStatsSchema>;

export const AiVisibilitySummarySchema = z.object({
  /** Whether the workspace has working DataForSEO credentials. */
  providerReady: z.boolean(),
  settings: AiSettingsSchema,
  prompts: z.object({ total: z.int(), active: z.int() }),
  pendingRuns: z.int(),
  lastRunOn: IsoDateSchema.nullable(),
  range: z.object({ start: IsoDateSchema, end: IsoDateSchema }),
  scoreVersion: z.int(),
  brands: z.array(AiBrandSchema),
  /** All platforms together, with the previous period of the same length. */
  overall: z.array(
    AiBrandStatsSchema.extend({
      previous: z
        .object({ score: z.number().nullable(), mentionRate: AiRateSchema.nullable() })
        .nullable(),
      /** The mention rate changed beyond the uncertainty of both periods. */
      significantChange: z.boolean(),
    }),
  ),
  platforms: z.array(
    z.object({
      platform: AiPlatformSchema,
      runs: z.int(),
      brands: z.array(AiBrandStatsSchema),
    }),
  ),
  /** All platforms together, by week (Monday). */
  trend: z.array(
    z.object({
      weekStart: IsoDateSchema,
      runs: z.int(),
      brands: z.array(
        z.object({
          entityId: z.uuid(),
          score: z.number().nullable(),
          mentionRate: z.number().nullable(),
          shareOfVoice: z.number().nullable(),
        }),
      ),
    }),
  ),
  topSources: z.array(
    z.object({
      domain: z.string(),
      citations: z.int(),
      share: z.number(),
      entityId: z.uuid().nullable(),
    }),
  ),
});
export type AiVisibilitySummary = z.infer<typeof AiVisibilitySummarySchema>;

export const AiRunStatusSchema = z.enum(["PENDING", "COMPLETED", "FAILED"]);

export const AiPromptRowSchema = z.object({
  id: z.uuid(),
  text: z.string(),
  locationCode: z.int(),
  languageCode: z.string(),
  tags: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  lastRunOn: IsoDateSchema.nullable(),
  /** Completed answers in the range. */
  runs: z.int(),
  /** The own brand over the range. */
  mentionRate: z.number().nullable(),
  citationRate: z.number().nullable(),
  /** The latest answer of each platform. */
  latest: z.array(
    z.object({
      platform: AiPlatformSchema,
      runOn: IsoDateSchema,
      mentioned: z.boolean(),
      /** The own brand's first-mention rank. */
      rank: z.int().nullable(),
      cited: z.boolean(),
      /** Competitors mentioned in the same answer. */
      competitors: z.int(),
    }),
  ),
  pending: z.boolean(),
});
export type AiPromptRow = z.infer<typeof AiPromptRowSchema>;

export const AiPromptListSchema = z.object({
  data: z.array(AiPromptRowSchema),
  total: z.int(),
  tags: z.array(z.string()),
});
export type AiPromptList = z.infer<typeof AiPromptListSchema>;

export const AiSentimentSchema = z.enum(["positive", "neutral", "negative"]);

export const AiAnswerSchema = z.object({
  id: z.uuid(),
  platform: AiPlatformSchema,
  method: z.string(),
  model: z.string().nullable(),
  runOn: IsoDateSchema,
  sampleIndex: z.int(),
  status: AiRunStatusSchema,
  completedAt: z.iso.datetime().nullable(),
  error: z.string().nullable(),
  /** Markdown when the platform returns Markdown. */
  answer: z.string().nullable(),
  webSearch: z.boolean().nullable(),
  fanOutQueries: z.array(z.string()),
  mentions: z.array(
    z.object({
      entityId: z.uuid(),
      firstRank: z.int(),
      mentionCount: z.int(),
      sentiment: AiSentimentSchema.nullable(),
      /** Where the brand appears in `answer`, for highlighting. */
      spans: z.array(z.object({ start: z.int(), end: z.int(), kind: z.enum(["name", "domain"]) })),
    }),
  ),
  citations: z.array(
    z.object({
      rank: z.int(),
      url: z.string().nullable(),
      domain: z.string(),
      title: z.string().nullable(),
      entityId: z.uuid().nullable(),
      /** One of the project's known pages, when the source is one. */
      pageUrl: z.string().nullable(),
    }),
  ),
  costUsd: z.number(),
});
export type AiAnswer = z.infer<typeof AiAnswerSchema>;

export const AiPromptDetailSchema = z.object({
  prompt: AiPromptRowSchema,
  brands: z.array(AiBrandSchema),
  /** Newest first. */
  answers: z.array(AiAnswerSchema),
});
export type AiPromptDetail = z.infer<typeof AiPromptDetailSchema>;

export const AiSourcesSchema = z.object({
  range: z.object({ start: IsoDateSchema, end: IsoDateSchema }),
  totalCitations: z.int(),
  domains: z.array(
    z.object({
      domain: z.string(),
      citations: z.int(),
      share: z.number(),
      entityId: z.uuid().nullable(),
      /** Prompts whose answers cite the domain. */
      prompts: z.int(),
      platforms: z.array(AiPlatformSchema),
    }),
  ),
  /** The own site's pages that answers cite. */
  pages: z.array(
    z.object({
      url: z.string(),
      citations: z.int(),
      prompts: z.int(),
      platforms: z.array(AiPlatformSchema),
      /** Found by a site audit or in Search Console. */
      known: z.boolean(),
    }),
  ),
});
export type AiSources = z.infer<typeof AiSourcesSchema>;
