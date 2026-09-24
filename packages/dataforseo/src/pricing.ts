/**
 * DataForSEO list prices in USD, used for estimates before paid work starts. What an action
 * actually cost always comes from the `cost` field of the responses; these numbers only size
 * previews and budget checks, and err on the high side.
 *
 * Source: dataforseo.com/pricing (SERP API Google organic, DataForSEO Labs), checked on
 * {@link DATAFORSEO_PRICES.checkedOn}.
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
  },
  labs: {
    /** Charged once per request. */
    perRequest: 0.012,
    /** Charged per returned item (keyword row). */
    perItem: 0.00012,
  },
} as const;

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

/** Rounds to the ledger precision (numeric(12,6)). */
export function roundUsd(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
