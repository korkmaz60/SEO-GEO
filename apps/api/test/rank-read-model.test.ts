import type { TrackedKeyword as TrackedKeywordRow } from "@seo-geo/db";
import { describe, expect, it } from "vitest";

import { buildRankTracker, type CheckRow } from "../src/rank-tracker/rank-read-model.js";

const OWN = "00000000-0000-7000-8000-000000000001";
const RIVAL = "00000000-0000-7000-8000-000000000002";
const brands = [
  { id: OWN, kind: "OWN" as const, name: "Example", colorSlot: 1 },
  { id: RIVAL, kind: "COMPETITOR" as const, name: "Rival", colorSlot: 2 },
];

function keyword(id: string, text: string): TrackedKeywordRow {
  return {
    id,
    workspaceId: "w",
    projectId: "p",
    keyword: text,
    locationCode: 2792,
    languageCode: "tr",
    device: "DESKTOP",
    searchEngine: "GOOGLE",
    tags: [],
    targetUrl: null,
    frequency: "DAILY",
    createdBy: null,
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
  };
}

function check(
  keywordId: string,
  date: string,
  position: number | null,
  extra: Partial<CheckRow> = {},
): CheckRow {
  return {
    trackedKeywordId: keywordId,
    checkedOn: new Date(`${date}T00:00:00Z`),
    status: "COMPLETED",
    depth: 30,
    position,
    url: position ? `https://example.com/${keywordId}` : null,
    serpFeatures: ["organic"],
    ownedFeatures: [],
    aiOverviewPresent: false,
    aiOverviewCited: false,
    competitorRanks: {},
    ...extra,
  };
}

const metrics = (searchVolume: number) => ({
  searchVolume,
  keywordDifficulty: 40,
  cpc: 0.3,
  intent: "commercial" as const,
  fetchedAt: "2026-09-01T00:00:00.000Z",
});

describe("buildRankTracker", () => {
  it("computes changes against the previous check, a week and a month back", () => {
    const view = buildRankTracker({
      keywords: [keyword("a", "kahve")],
      checks: [
        check("a", "2026-08-25", 12),
        check("a", "2026-09-17", 8),
        check("a", "2026-09-23", 5),
        check("a", "2026-09-24", 3, { competitorRanks: { [RIVAL]: { position: 1, url: null } } }),
      ],
      metrics: new Map([["a", metrics(1000)]]),
      brands,
      today: "2026-09-24",
      days: 30,
    });
    const [row] = view.keywords;
    expect(row?.changes).toEqual({
      previous: { from: 5, to: 3 },
      week: { from: 8, to: 3 },
      month: { from: 12, to: 3 },
    });
    expect(row?.competitors).toEqual({ [RIVAL]: 1 });
    // The 30-day window starts on 2026-08-26.
    expect(row?.history.map((point) => point.date)).toEqual([
      "2026-09-17",
      "2026-09-23",
      "2026-09-24",
    ]);
  });

  it("does not compare with checks far from the target day", () => {
    const view = buildRankTracker({
      keywords: [keyword("a", "kahve")],
      checks: [check("a", "2026-08-01", 20), check("a", "2026-09-24", 3)],
      metrics: new Map(),
      brands,
      today: "2026-09-24",
      days: 30,
    });
    expect(view.keywords[0]?.changes).toEqual({
      previous: { from: 20, to: 3 },
      week: null,
      month: null,
    });
  });

  it("summarizes positions, movement, AI Overviews and share of voice", () => {
    const view = buildRankTracker({
      keywords: [keyword("a", "kahve"), keyword("b", "espresso"), keyword("c", "çay")],
      checks: [
        check("a", "2026-09-23", 4),
        check("a", "2026-09-24", 1, {
          aiOverviewPresent: true,
          aiOverviewCited: true,
          competitorRanks: { [RIVAL]: { position: 2, url: null } },
        }),
        check("b", "2026-09-23", 7),
        check("b", "2026-09-24", null, {
          aiOverviewPresent: true,
          competitorRanks: { [RIVAL]: { position: 1, url: null } },
        }),
        { ...check("c", "2026-09-24", null), status: "PENDING" },
      ],
      metrics: new Map([
        ["a", metrics(1000)],
        ["b", metrics(3000)],
      ]),
      brands,
      today: "2026-09-24",
      days: 7,
    });
    expect(view.summary).toMatchObject({
      tracked: 3,
      checked: 2,
      ranking: 1,
      top3: 1,
      top10: 1,
      averagePosition: 1,
      improved: 1,
      declined: 1,
      aiOverviews: 2,
      aiOverviewCitations: 1,
      pendingChecks: 1,
      lastCheckedOn: "2026-09-24",
      // First for 1000 of 4000 weighted searches.
      visibility: 25,
      estimatedTraffic: 280,
    });
    expect(view.summary.shareOfVoice).toEqual([
      expect.objectContaining({ entityId: OWN, visibility: 25, ranking: 1 }),
      // Second for 1000 (15% CTR) and first for 3000 (28%): (150 + 840) / 1120.
      expect.objectContaining({ entityId: RIVAL, visibility: 88.4, ranking: 2 }),
    ]);
    expect(view.summary.history).toEqual([
      // Fourth for 1000 (8% CTR) and seventh for 3000 (4%): (80 + 120) / 1120.
      { date: "2026-09-23", visibility: 17.9, averagePosition: 5.5, keywords: 2 },
      { date: "2026-09-24", visibility: 25, averagePosition: 1, keywords: 2 },
    ]);
    const pending = view.keywords.find((row) => row.keyword === "çay");
    expect(pending).toMatchObject({ pending: true, latest: null, history: [] });
  });

  it("carries weekly positions forward in the daily visibility chart", () => {
    const weekly = { ...keyword("a", "kahve"), frequency: "WEEKLY" as const };
    const view = buildRankTracker({
      keywords: [weekly],
      checks: [check("a", "2026-09-15", 2), check("a", "2026-09-22", 2)],
      metrics: new Map(),
      brands,
      today: "2026-09-24",
      days: 10,
    });
    expect(view.summary.history.map((point) => point.date)).toEqual([
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
  });

  it("marks a keyword whose newest check failed", () => {
    const view = buildRankTracker({
      keywords: [keyword("a", "kahve")],
      checks: [
        check("a", "2026-09-23", 4),
        { ...check("a", "2026-09-24", null), status: "FAILED" },
      ],
      metrics: new Map(),
      brands,
      today: "2026-09-24",
      days: 7,
    });
    expect(view.keywords[0]).toMatchObject({ failed: true, latest: { position: 4 } });
  });
});
