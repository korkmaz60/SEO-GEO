/**
 * Estimated share of clicks by organic position (model version 1): positions 1–10 follow a
 * typical desktop CTR curve, 11–20 get 1%, deeper results none. Used for visibility and
 * estimated traffic; it is a model, not a measurement.
 */
export const CTR_MODEL_VERSION = 1;
const TOP_TEN_CTR = [0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02];
const PAGE_TWO_CTR = 0.01;

export function estimatedCtr(position: number | null | undefined): number {
  if (!position || position < 1) return 0;
  if (position <= TOP_TEN_CTR.length) return TOP_TEN_CTR[position - 1] ?? 0;
  return position <= 20 ? PAGE_TWO_CTR : 0;
}

export interface RankedKeyword {
  position: number | null;
  searchVolume: number | null;
}

/** Keywords without a known volume still count, with the smallest weight. */
function weight(keyword: RankedKeyword): number {
  return Math.max(1, keyword.searchVolume ?? 0);
}

/**
 * Visibility in percent: the estimated clicks the positions earn, relative to ranking first
 * for every keyword, weighted by search volume. 100 means first everywhere.
 */
export function visibilityPercent(keywords: readonly RankedKeyword[]): number {
  let earned = 0;
  let possible = 0;
  for (const keyword of keywords) {
    earned += weight(keyword) * estimatedCtr(keyword.position);
    possible += weight(keyword) * estimatedCtr(1);
  }
  return possible === 0 ? 0 : Math.round((earned / possible) * 1000) / 10;
}

/** Estimated monthly organic clicks from the positions. */
export function estimatedTraffic(keywords: readonly RankedKeyword[]): number {
  return Math.round(
    keywords.reduce((sum, k) => sum + (k.searchVolume ?? 0) * estimatedCtr(k.position), 0),
  );
}
