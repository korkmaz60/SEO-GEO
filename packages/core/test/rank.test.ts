import { describe, expect, it } from "vitest";

import {
  competitorRanks,
  estimatedCtr,
  estimatedTraffic,
  summarizeSerp,
  visibilityPercent,
  type SerpLike,
} from "../src/index.js";

const serp: SerpLike = {
  itemTypes: ["ai_overview", "paid", "featured_snippet", "organic", "people_also_ask", "video"],
  organic: [
    { rankGroup: 1, rankAbsolute: 4, domain: "www.rival.com", url: "https://www.rival.com/a" },
    { rankGroup: 2, rankAbsolute: 6, domain: "notexample.com", url: "https://notexample.com/" },
    { rankGroup: 3, rankAbsolute: 7, domain: "www.example.com", url: "https://www.example.com/k" },
    {
      rankGroup: 4,
      rankAbsolute: 10,
      domain: "blog.example.com",
      url: "https://blog.example.com/",
    },
    { rankGroup: 5, rankAbsolute: 11, domain: "shop.rival.com", url: "https://shop.rival.com/" },
  ],
  features: [
    { type: "paid", links: [{ domain: "www.example.com", url: "https://www.example.com/ad" }] },
    {
      type: "featured_snippet",
      links: [{ domain: "www.rival.com", url: "https://www.rival.com/a" }],
    },
    {
      type: "people_also_ask",
      links: [{ domain: "blog.example.com", url: "https://blog.example.com/faq" }],
    },
    { type: "video", links: [{ domain: null, url: "https://www.youtube.com/watch?v=1" }] },
  ],
  aiOverview: {
    references: [
      { domain: "tr.wikipedia.org", url: "https://tr.wikipedia.org/wiki/K" },
      { domain: "www.example.com", url: "https://www.example.com/guide" },
      { domain: "www.example.com", url: "https://www.example.com/guide" },
    ],
  },
};

describe("summarizeSerp", () => {
  it("finds the best position, owned features and AI Overview citations", () => {
    const summary = summarizeSerp(serp, [{ domain: "example.com", includeSubdomains: true }]);
    expect(summary).toEqual({
      position: 3,
      rankAbsolute: 7,
      url: "https://www.example.com/k",
      serpFeatures: serp.itemTypes,
      // Ads are not owned features; notexample.com is not example.com.
      ownedFeatures: ["people_also_ask"],
      aiOverviewPresent: true,
      aiOverviewCited: true,
      aiOverviewCitedUrls: ["https://www.example.com/guide"],
    });
  });

  it("respects the subdomain setting", () => {
    const summary = summarizeSerp(serp, [{ domain: "blog.example.com", includeSubdomains: false }]);
    expect(summary).toMatchObject({ position: 4, ownedFeatures: ["people_also_ask"] });
    expect(summary.aiOverviewCited).toBe(false);
  });

  it("reports a site that does not rank", () => {
    const summary = summarizeSerp(
      { itemTypes: ["organic"], organic: serp.organic, features: [], aiOverview: null },
      [{ domain: "absent.com", includeSubdomains: true }],
    );
    expect(summary).toMatchObject({
      position: null,
      url: null,
      ownedFeatures: [],
      aiOverviewPresent: false,
      aiOverviewCited: false,
    });
  });
});

describe("competitorRanks", () => {
  it("returns the best position of each competitor that ranks", () => {
    expect(
      competitorRanks(serp, [
        { id: "rival", target: [{ domain: "rival.com", includeSubdomains: true }] },
        { id: "absent", target: [{ domain: "absent.com", includeSubdomains: true }] },
      ]),
    ).toEqual({ rival: { position: 1, url: "https://www.rival.com/a" } });
  });
});

describe("visibility", () => {
  it("uses the CTR model", () => {
    expect(estimatedCtr(1)).toBe(0.28);
    expect(estimatedCtr(10)).toBe(0.02);
    expect(estimatedCtr(15)).toBe(0.01);
    expect(estimatedCtr(21)).toBe(0);
    expect(estimatedCtr(null)).toBe(0);
  });

  it("weights positions by search volume", () => {
    expect(visibilityPercent([{ position: 1, searchVolume: 1000 }])).toBe(100);
    expect(
      visibilityPercent([
        { position: 1, searchVolume: 1000 },
        { position: null, searchVolume: 1000 },
      ]),
    ).toBe(50);
    expect(visibilityPercent([])).toBe(0);
    expect(
      estimatedTraffic([
        { position: 1, searchVolume: 1000 },
        { position: 3, searchVolume: 500 },
      ]),
    ).toBe(335);
  });
});
