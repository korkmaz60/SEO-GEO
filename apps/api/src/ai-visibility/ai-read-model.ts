import {
  AI_PLATFORMS,
  type AiBrandStats,
  type AiPlatform,
  type AiVisibilitySummary,
} from "@seo-geo/contracts";
import {
  addDays,
  isSignificantChange,
  visibilityFromCounts,
  type BrandCounts,
  type BrandVisibility,
} from "@seo-geo/core";

/** Completed answers of one platform and week, in the current or the previous period. */
export interface RunBucket {
  current: boolean;
  platform: AiPlatform;
  /** Monday of the week, `YYYY-MM-DD`. */
  week: string;
  runs: number;
}

/** Mentions of one brand in a bucket. */
export interface MentionBucket extends Omit<RunBucket, "runs"> {
  entityId: string;
  mentioned: number;
  rankSum: number;
  prominenceSum: number;
}

/** Answers citing one brand in a bucket. */
export interface CitationBucket extends Omit<RunBucket, "runs"> {
  entityId: string;
  cited: number;
}

export interface VisibilityBuckets {
  runs: RunBucket[];
  mentions: MentionBucket[];
  citations: CitationBucket[];
}

type BucketFilter = (bucket: Omit<RunBucket, "runs">) => boolean;

/** Completed answers in the buckets that pass `filter`. */
export function runsOf(buckets: VisibilityBuckets, filter: BucketFilter): number {
  return buckets.runs.filter(filter).reduce((sum, bucket) => sum + bucket.runs, 0);
}

/** The visibility of every brand over the buckets that pass `filter`. */
export function visibilityOf(
  buckets: VisibilityBuckets,
  entityIds: readonly string[],
  filter: BucketFilter,
): BrandVisibility[] {
  const total = runsOf(buckets, filter);
  const counts = new Map<string, BrandCounts>(
    entityIds.map((entityId) => [
      entityId,
      { entityId, mentioned: 0, cited: 0, rankSum: 0, prominenceSum: 0 },
    ]),
  );
  for (const bucket of buckets.mentions.filter(filter)) {
    const entry = counts.get(bucket.entityId);
    if (!entry) continue;
    entry.mentioned += bucket.mentioned;
    entry.rankSum += bucket.rankSum;
    entry.prominenceSum += bucket.prominenceSum;
  }
  for (const bucket of buckets.citations.filter(filter)) {
    const entry = counts.get(bucket.entityId);
    if (entry) entry.cited += bucket.cited;
  }
  return visibilityFromCounts(total, [...counts.values()]);
}

export function toBrandStats(stats: BrandVisibility): AiBrandStats {
  return {
    entityId: stats.entityId,
    runs: stats.runs,
    mentionRate: stats.mentionRate,
    citationRate: stats.citationRate,
    shareOfVoice: stats.shareOfVoice,
    averageRank: stats.averageRank,
    score: stats.score,
    lowSample: stats.lowSample,
  };
}

/** Monday of the week of a day (`YYYY-MM-DD`). */
export function weekStart(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

/**
 * The visibility part of the summary: all platforms together with the previous period, each
 * platform, and the weekly trend.
 */
export function buildVisibility(input: {
  buckets: VisibilityBuckets;
  entityIds: readonly string[];
  platforms: readonly AiPlatform[];
  start: string;
  end: string;
}): Pick<AiVisibilitySummary, "overall" | "platforms" | "trend"> {
  const { buckets, entityIds } = input;
  const current = visibilityOf(buckets, entityIds, (bucket) => bucket.current);
  const previous = visibilityOf(buckets, entityIds, (bucket) => !bucket.current);
  const previousRuns = runsOf(buckets, (bucket) => !bucket.current);

  const overall = current.map((stats, index) => {
    const before = previous[index];
    return {
      ...toBrandStats(stats),
      previous:
        before && previousRuns > 0
          ? { score: before.score, mentionRate: before.mentionRate }
          : null,
      significantChange: isSignificantChange(before?.mentionRate ?? null, stats.mentionRate),
    };
  });

  const seen = new Set<AiPlatform>(input.platforms);
  for (const bucket of buckets.runs) if (bucket.current) seen.add(bucket.platform);
  const platforms = AI_PLATFORMS.filter((platform) => seen.has(platform)).map((platform) => {
    const filter: BucketFilter = (bucket) => bucket.current && bucket.platform === platform;
    return {
      platform,
      runs: runsOf(buckets, filter),
      brands: visibilityOf(buckets, entityIds, filter).map(toBrandStats),
    };
  });

  const trend: AiVisibilitySummary["trend"] = [];
  for (let week = weekStart(input.start); week <= input.end; week = addDays(week, 7)) {
    const filter: BucketFilter = (bucket) => bucket.current && bucket.week === week;
    trend.push({
      weekStart: week,
      runs: runsOf(buckets, filter),
      brands: visibilityOf(buckets, entityIds, filter).map((entry) => ({
        entityId: entry.entityId,
        score: entry.score,
        mentionRate: entry.mentionRate?.value ?? null,
        shareOfVoice: entry.shareOfVoice,
      })),
    });
  }

  return { overall, platforms, trend };
}
