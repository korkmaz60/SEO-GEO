/**
 * DataForSEO list prices in USD, used for estimates before paid work starts. What an action
 * actually cost always comes from the `cost` field of the responses; these numbers only size
 * previews and budget checks, and err on the high side.
 *
 * Source: dataforseo.com/pricing (SERP API Google organic and AI Mode, DataForSEO Labs, AI
 * Optimization LLM Scraper and LLM Responses), checked on {@link DATAFORSEO_PRICES.checkedOn}.
 */
export const DATAFORSEO_PRICES = {
  checkedOn: "2026-09-24",
  serp: {
    /** Google organic SERP: the first page of 10 results, by execution mode. */
    googleOrganicFirstPage: { standard: 0.0006, priority: 0.0012, live: 0.002 },
    /** Every further page of 10 results costs this share of the first page. */
    additionalPageFactor: 0.75,
    /**
     * `load_async_ai_overview`. Refunded when the SERP has no AI Overview that loads
     * asynchronously, so this is an upper bound.
     */
    asyncAiOverview: 0.0006,
    /** Google AI Mode: one answer page, by execution mode. */
    googleAiMode: { standard: 0.0012, live: 0.004 },
  },
  labs: {
    /** Charged once per request. */
    perRequest: 0.012,
    /** Charged per returned item (keyword row). */
    perItem: 0.00012,
  },
  aiOptimization: {
    /** LLM Scraper (ChatGPT and Gemini as users see them): one answer page. */
    llmScraper: { standard: 0.0012, live: 0.004 },
    /**
     * LLM Responses: a fee per task plus what the model provider charges for tokens and web
     * searches (reported per answer as `money_spent`). Standard tasks also pay 0.01 in advance,
     * settled against the provider's charge.
     */
    llmResponsesTaskFee: { standard: 0.0002, live: 0.0006 },
  },
  /**
   * Backlinks API, every live endpoint (checked 2026-09-25). Pay-as-you-go since 1 July 2026,
   * when the 100 USD monthly commitment was dropped and rates rose.
   */
  backlinks: {
    perRequest: 0.024,
    /** Charged per returned row (item). */
    perRow: 0.000036,
  },
} as const;

/**
 * Rough upper bounds of what model providers charge for one answer with web search, by model
 * family. They only size previews and budget checks; the real charge comes back with each
 * answer. Checked on {@link DATAFORSEO_PRICES.checkedOn}.
 */
const PROVIDER_ANSWER_ESTIMATES: readonly { pattern: RegExp; usd: number }[] = [
  { pattern: /opus/i, usd: 0.6 },
  { pattern: /sonnet/i, usd: 0.15 },
  { pattern: /haiku/i, usd: 0.05 },
  { pattern: /sonar-(reasoning|deep)/i, usd: 0.05 },
  { pattern: /sonar-pro/i, usd: 0.03 },
  { pattern: /sonar/i, usd: 0.01 },
  { pattern: /gpt-4o-mini|gpt-4\.1-mini|gpt-4\.1-nano|gpt-5-mini|gpt-5-nano|flash/i, usd: 0.02 },
];
/** Used for models not in the table above. */
const DEFAULT_PROVIDER_ANSWER_ESTIMATE = 0.15;

/** Upper bound of what the model provider charges for one answer of `model`. */
export function estimateProviderAnswerCost(model: string): number {
  return (
    PROVIDER_ANSWER_ESTIMATES.find((entry) => entry.pattern.test(model))?.usd ??
    DEFAULT_PROVIDER_ANSWER_ESTIMATE
  );
}

export type AiAnswerSource =
  | { method: "llm_scraper" }
  | { method: "llm_responses"; model: string }
  | { method: "google_ai_mode" }
  /** A Google organic SERP (first page) with its asynchronous AI Overview. */
  | { method: "google_ai_overview" };

/** Upper-bound cost of `count` AI answers fetched with the given method. */
export function estimateAiAnswerCost(
  source: AiAnswerSource,
  options: { mode?: "standard" | "live"; count?: number } = {},
): number {
  const mode = options.mode ?? "standard";
  const prices = DATAFORSEO_PRICES;
  let perAnswer: number;
  switch (source.method) {
    case "llm_scraper":
      perAnswer = prices.aiOptimization.llmScraper[mode];
      break;
    case "llm_responses":
      perAnswer =
        prices.aiOptimization.llmResponsesTaskFee[mode] + estimateProviderAnswerCost(source.model);
      break;
    case "google_ai_mode":
      perAnswer = prices.serp.googleAiMode[mode];
      break;
    case "google_ai_overview":
      perAnswer = estimateSerpCost({ mode, loadAsyncAiOverview: true });
      break;
  }
  return roundUsd(perAnswer * (options.count ?? 1));
}

/** Standard queue (task_post), high-priority queue, or live (answer in the same request). */
export type SerpMode = "standard" | "priority" | "live";

/** Results per SERP page; DataForSEO bills SERPs per page of this size. */
export const SERP_PAGE_SIZE = 10;

/** Pages of 10 results needed for `depth` results. */
export function serpPages(depth: number): number {
  return Math.max(1, Math.ceil(depth / SERP_PAGE_SIZE));
}

export interface SerpCostInput {
  mode: SerpMode;
  /** Results per SERP; defaults to 10. */
  depth?: number;
  loadAsyncAiOverview?: boolean;
  /** Number of SERPs (keywords); defaults to 1. */
  count?: number;
}

/** Upper-bound cost of Google organic SERPs. */
export function estimateSerpCost(input: SerpCostInput): number {
  const prices = DATAFORSEO_PRICES.serp;
  const first = prices.googleOrganicFirstPage[input.mode];
  const pages = serpPages(input.depth ?? SERP_PAGE_SIZE);
  const perSerp =
    first * (1 + prices.additionalPageFactor * (pages - 1)) +
    (input.loadAsyncAiOverview ? prices.asyncAiOverview : 0);
  return roundUsd(perSerp * (input.count ?? 1));
}

/** Upper-bound cost of DataForSEO Labs requests returning at most `items` rows in total. */
export function estimateLabsCost(input: { items: number; requests?: number }): number {
  const prices = DATAFORSEO_PRICES.labs;
  return roundUsd((input.requests ?? 1) * prices.perRequest + input.items * prices.perItem);
}

/** Upper-bound cost of Backlinks API requests returning at most `rows` rows in total. */
export function estimateBacklinksCost(input: { rows: number; requests?: number }): number {
  const prices = DATAFORSEO_PRICES.backlinks;
  return roundUsd((input.requests ?? 1) * prices.perRequest + input.rows * prices.perRow);
}

/** Rounds to the ledger precision (numeric(12,6)). */
export function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
