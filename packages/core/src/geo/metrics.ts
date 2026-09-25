/** Version of the AI visibility score formula; stored with every reported score. */
export const AI_VISIBILITY_SCORE_VERSION = 1;
/** Below this many answers per platform and period, results carry a "low sample" flag. */
export const LOW_SAMPLE_RUNS = 20;

const WILSON_Z = 1.96;

/** What one answer showed about the tracked brands. */
export interface RunOutcome {
  /** Mentioned brands and their first-mention rank (1 = mentioned first). */
  mentions: ReadonlyMap<string, number>;
  /** Brands with at least one cited source on their domains. */
  cited: ReadonlySet<string>;
}

/** A proportion with its 95% Wilson score interval. */
export interface Rate {
  value: number;
  low: number;
  high: number;
}

export interface BrandVisibility {
  entityId: string;
  /** Answers considered (N). */
  runs: number;
  mentionedRuns: number;
  citedRuns: number;
  mentionRate: Rate | null;
  citationRate: Rate | null;
  /** Share of all brand mentions among the tracked brands; `null` when nobody is mentioned. */
  shareOfVoice: number | null;
  /** Mean first-mention rank over the answers that mention the brand. */
  averageRank: number | null;
  /** Mean of 1 / first rank over all answers (0 when not mentioned). */
  prominence: number | null;
  /** AI visibility score v1, 0–100 with one decimal; `null` without answers. */
  score: number | null;
  /** Fewer than {@link LOW_SAMPLE_RUNS} answers: read with care. */
  lowSample: boolean;
}

/** 95% Wilson score interval for `successes` out of `total`; `null` when `total` is 0. */
export function wilsonInterval(successes: number, total: number): Rate | null {
  if (total <= 0) return null;
  const p = successes / total;
  const z2 = WILSON_Z * WILSON_Z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const margin =
    (WILSON_Z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return {
    value: p,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}

/**
 * AI visibility score v1 (docs/geo-aeo.md):
 * `100 × (0.45 × mention rate + 0.35 × citation rate + 0.20 × prominence)`.
 */
export function aiVisibilityScore(mentionRate: number, citationRate: number, prominence: number) {
  const score = 100 * (0.45 * mentionRate + 0.35 * citationRate + 0.2 * prominence);
  return Math.round(score * 10) / 10;
}

/**
 * Mention rate, citation rate, share of voice, average rank, prominence and the AI
 * visibility score of every brand over a set of answers (one platform and period, or any
 * other grouping the caller chooses).
 */
export function brandVisibility(
  runs: readonly RunOutcome[],
  entityIds: readonly string[],
): BrandVisibility[] {
  const total = runs.length;
  const stats = entityIds.map((entityId) => {
    let mentioned = 0;
    let cited = 0;
    let rankSum = 0;
    let prominenceSum = 0;
    for (const run of runs) {
      const rank = run.mentions.get(entityId);
      if (rank !== undefined) {
        mentioned++;
        rankSum += rank;
        prominenceSum += 1 / Math.max(1, rank);
      }
      if (run.cited.has(entityId)) cited++;
    }
    return { entityId, mentioned, cited, rankSum, prominenceSum };
  });
  const allMentions = stats.reduce((sum, entry) => sum + entry.mentioned, 0);

  return stats.map((entry) => {
    const mentionRate = wilsonInterval(entry.mentioned, total);
    const citationRate = wilsonInterval(entry.cited, total);
    const prominence = total > 0 ? entry.prominenceSum / total : null;
    return {
      entityId: entry.entityId,
      runs: total,
      mentionedRuns: entry.mentioned,
      citedRuns: entry.cited,
      mentionRate,
      citationRate,
      shareOfVoice: allMentions > 0 ? entry.mentioned / allMentions : null,
      averageRank: entry.mentioned > 0 ? entry.rankSum / entry.mentioned : null,
      prominence,
      score:
        mentionRate && citationRate && prominence !== null
          ? aiVisibilityScore(mentionRate.value, citationRate.value, prominence)
          : null,
      lowSample: total < LOW_SAMPLE_RUNS,
    };
  });
}

export interface SourceShare {
  domain: string;
  citations: number;
  /** Share of all citations, 0–1. */
  share: number;
}

/** How often each domain is cited, over all citations (tracked brands or not). */
export function sourceShare(citations: readonly { domain: string }[]): SourceShare[] {
  const counts = new Map<string, number>();
  for (const citation of citations) {
    counts.set(citation.domain, (counts.get(citation.domain) ?? 0) + 1);
  }
  const total = citations.length;
  return [...counts]
    .map(([domain, count]) => ({ domain, citations: count, share: total > 0 ? count / total : 0 }))
    .sort((a, b) => b.citations - a.citations || a.domain.localeCompare(b.domain));
}

/**
 * Whether a rate really changed between two periods: only when their 95% intervals do not
 * overlap (docs/geo-aeo.md, "Uncertainty").
 */
export function isSignificantChange(before: Rate | null, after: Rate | null): boolean {
  if (!before || !after) return false;
  return after.low > before.high || after.high < before.low;
}
