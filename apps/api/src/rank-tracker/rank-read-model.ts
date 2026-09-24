import type {
  KeywordMetrics,
  LatestRank,
  RankChange,
  RankTrackerSummary,
  TrackedKeyword,
  VisibilityPoint,
} from "@seo-geo/contracts";
import {
  addDays,
  daysBetween,
  estimatedTraffic,
  visibilityPercent,
  type RankedKeyword,
} from "@seo-geo/core";
import type { BrandEntity, RankCheck, TrackedKeyword as TrackedKeywordRow } from "@seo-geo/db";
import { z } from "zod";

/** A weekly keyword's last position still counts for this many days in daily charts. */
const CARRY_FORWARD_DAYS = 7;

export type CheckRow = Pick<
  RankCheck,
  | "trackedKeywordId"
  | "checkedOn"
  | "status"
  | "depth"
  | "position"
  | "url"
  | "serpFeatures"
  | "ownedFeatures"
  | "aiOverviewPresent"
  | "aiOverviewCited"
  | "competitorRanks"
>;

const CompetitorRanksSchema = z.record(
  z.string(),
  z.object({ position: z.int(), url: z.string().nullable() }),
);

export function parseCompetitorRanks(value: unknown): Record<string, { position: number }> {
  const parsed = CompetitorRanksSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

const day = (date: Date) => date.toISOString().slice(0, 10);

interface KeywordState {
  row: TrackedKeywordRow;
  metrics: KeywordMetrics | null;
  /** Completed checks, oldest first. */
  completed: CheckRow[];
  latest: CheckRow | null;
  pending: boolean;
  failed: boolean;
}

function change(from: CheckRow | undefined, to: CheckRow | null): RankChange {
  if (!from || !to) return null;
  return { from: from.position, to: to.position };
}

/** The latest completed check on or before `date`, at most `tolerance` days before it. */
function checkOnOrBefore(
  completed: readonly CheckRow[],
  date: string,
  tolerance = Number.POSITIVE_INFINITY,
): CheckRow | undefined {
  for (let index = completed.length - 1; index >= 0; index--) {
    const check = completed[index] as CheckRow;
    const checkDay = day(check.checkedOn);
    if (checkDay <= date) return daysBetween(checkDay, date) <= tolerance ? check : undefined;
  }
  return undefined;
}

/** How far a comparison check may be from the day a week or month back. */
const COMPARISON_TOLERANCE_DAYS = 7;
/** Days of checks the read model needs beyond the requested window (month comparison). */
export const EXTRA_HISTORY_DAYS = 30 + COMPARISON_TOLERANCE_DAYS;

function toLatest(check: CheckRow): LatestRank {
  return {
    checkedOn: day(check.checkedOn),
    position: check.position,
    url: check.url,
    depth: check.depth,
    serpFeatures: check.serpFeatures,
    ownedFeatures: check.ownedFeatures,
    aiOverviewPresent: check.aiOverviewPresent,
    aiOverviewCited: check.aiOverviewCited,
  };
}

export interface ReadModelInput {
  keywords: readonly TrackedKeywordRow[];
  checks: readonly CheckRow[];
  /** Metrics by tracked keyword ID. */
  metrics: ReadonlyMap<string, KeywordMetrics>;
  brands: readonly Pick<BrandEntity, "id" | "kind" | "name" | "colorSlot">[];
  /** Today in the project's time zone. */
  today: string;
  /** Days of history to return. */
  days: number;
}

function keywordStates(input: ReadModelInput): KeywordState[] {
  const byKeyword = new Map<string, CheckRow[]>();
  for (const check of input.checks) {
    const list = byKeyword.get(check.trackedKeywordId) ?? [];
    list.push(check);
    byKeyword.set(check.trackedKeywordId, list);
  }
  return input.keywords.map((row) => {
    const checks = (byKeyword.get(row.id) ?? []).sort(
      (a, b) => a.checkedOn.getTime() - b.checkedOn.getTime(),
    );
    const completed = checks.filter((check) => check.status === "COMPLETED");
    const latest = completed.at(-1) ?? null;
    const newest = checks.at(-1);
    return {
      row,
      metrics: input.metrics.get(row.id) ?? null,
      completed,
      latest,
      pending: checks.some((check) => check.status === "PENDING"),
      failed: newest?.status === "FAILED",
    };
  });
}

function toTrackedKeyword(
  state: KeywordState,
  competitorIds: readonly string[],
  windowStart: string,
): TrackedKeyword {
  const { row, latest, completed } = state;
  const latestDay = latest ? day(latest.checkedOn) : null;
  const previous = latest ? completed.at(-2) : undefined;
  const ranks = latest ? parseCompetitorRanks(latest.competitorRanks) : {};
  return {
    id: row.id,
    keyword: row.keyword,
    locationCode: row.locationCode,
    languageCode: row.languageCode,
    device: row.device,
    tags: row.tags,
    targetUrl: row.targetUrl,
    frequency: row.frequency,
    createdAt: row.createdAt.toISOString(),
    metrics: state.metrics,
    latest: latest ? toLatest(latest) : null,
    pending: state.pending,
    failed: state.failed,
    changes: {
      previous: change(previous, latest),
      week: latestDay
        ? change(
            checkOnOrBefore(completed, addDays(latestDay, -7), COMPARISON_TOLERANCE_DAYS),
            latest,
          )
        : null,
      month: latestDay
        ? change(
            checkOnOrBefore(completed, addDays(latestDay, -30), COMPARISON_TOLERANCE_DAYS),
            latest,
          )
        : null,
    },
    history: completed
      .filter((check) => day(check.checkedOn) >= windowStart)
      .map((check) => ({ date: day(check.checkedOn), position: check.position })),
    competitors: Object.fromEntries(competitorIds.map((id) => [id, ranks[id]?.position ?? null])),
  };
}

function ranked(states: readonly KeywordState[]): RankedKeyword[] {
  return states.flatMap((state) =>
    state.latest
      ? [{ position: state.latest.position, searchVolume: state.metrics?.searchVolume ?? null }]
      : [],
  );
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function visibilityHistory(
  states: readonly KeywordState[],
  windowStart: string,
  today: string,
): VisibilityPoint[] {
  const points: VisibilityPoint[] = [];
  for (let date = windowStart; date <= today; date = addDays(date, 1)) {
    const keywords: RankedKeyword[] = [];
    for (const state of states) {
      const check = checkOnOrBefore(state.completed, date);
      if (!check || daysBetween(day(check.checkedOn), date) >= CARRY_FORWARD_DAYS) continue;
      keywords.push({
        position: check.position,
        searchVolume: state.metrics?.searchVolume ?? null,
      });
    }
    if (keywords.length === 0) continue;
    points.push({
      date,
      visibility: visibilityPercent(keywords),
      averagePosition: average(keywords.flatMap((k) => (k.position === null ? [] : [k.position]))),
      keywords: keywords.length,
    });
  }
  return points;
}

/** The rank tracker page: one row per keyword and the project summary. */
export function buildRankTracker(input: ReadModelInput): {
  keywords: TrackedKeyword[];
  summary: RankTrackerSummary;
} {
  const states = keywordStates(input);
  const windowStart = addDays(input.today, -(input.days - 1));
  const competitors = input.brands.filter((brand) => brand.kind === "COMPETITOR");
  const keywords = states.map((state) =>
    toTrackedKeyword(
      state,
      competitors.map((brand) => brand.id),
      windowStart,
    ),
  );

  const checked = states.filter((state) => state.latest !== null);
  const positions = checked.flatMap((state) =>
    state.latest?.position == null ? [] : [state.latest.position],
  );
  let improved = 0;
  let declined = 0;
  for (const keyword of keywords) {
    const moved = keyword.changes.previous;
    if (!moved) continue;
    const from = moved.from ?? Number.POSITIVE_INFINITY;
    const to = moved.to ?? Number.POSITIVE_INFINITY;
    if (to < from) improved++;
    else if (to > from) declined++;
  }

  const shareOfVoice = input.brands.map((brand) => {
    const entityKeywords: RankedKeyword[] = checked.map((state) => ({
      position:
        brand.kind === "OWN"
          ? (state.latest?.position ?? null)
          : (parseCompetitorRanks(state.latest?.competitorRanks)[brand.id]?.position ?? null),
      searchVolume: state.metrics?.searchVolume ?? null,
    }));
    return {
      entityId: brand.id,
      name: brand.name,
      kind: brand.kind,
      colorSlot: brand.colorSlot,
      visibility: visibilityPercent(entityKeywords),
      ranking: entityKeywords.filter((keyword) => keyword.position !== null).length,
    };
  });

  const lastChecked = checked
    .map((state) => day((state.latest as CheckRow).checkedOn))
    .sort()
    .at(-1);

  return {
    keywords,
    summary: {
      tracked: states.length,
      checked: checked.length,
      ranking: positions.length,
      top3: positions.filter((position) => position <= 3).length,
      top10: positions.filter((position) => position <= 10).length,
      visibility: visibilityPercent(ranked(checked)),
      estimatedTraffic: estimatedTraffic(ranked(checked)),
      averagePosition: average(positions),
      improved,
      declined,
      aiOverviews: checked.filter((state) => state.latest?.aiOverviewPresent).length,
      aiOverviewCitations: checked.filter((state) => state.latest?.aiOverviewCited).length,
      pendingChecks: states.filter((state) => state.pending).length,
      lastCheckedOn: lastChecked ?? null,
      history: visibilityHistory(states, windowStart, input.today),
      shareOfVoice,
    },
  };
}
