import { describe, expect, it } from "vitest";

import {
  getKeywordIdeas,
  getKeywordOverview,
  getKeywordSuggestions,
  getRelatedKeywords,
} from "../src/index.js";
import { envelope, fakeFetch, fixture, testClient } from "./helpers.js";

const market = { locationCode: 2792, languageCode: "tr" };

describe("getKeywordSuggestions", () => {
  it("returns the seed and long-tail keywords with normalized metrics", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-keyword-suggestions") });
    const result = await getKeywordSuggestions(testClient(fetch), {
      ...market,
      keyword: "  kahve makinesi ",
      limit: 3,
      includeSeedKeyword: true,
    });

    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live",
      body: [
        {
          keyword: "kahve makinesi",
          location_code: 2792,
          language_code: "tr",
          limit: 3,
          include_seed_keyword: true,
        },
      ],
    });
    expect(result.cost).toBe(0.01236);
    expect(result.totalCount).toBe(1873);
    expect(result.seed).toEqual({
      keyword: "kahve makinesi",
      searchVolume: 110000,
      cpc: 0.38,
      competition: 1,
      competitionLevel: "HIGH",
      keywordDifficulty: 54,
      intent: "commercial",
      secondaryIntents: ["transactional"],
      // Sorted oldest first.
      monthlySearches: [
        { year: 2025, month: 12, searchVolume: 165000 },
        { year: 2026, month: 7, searchVolume: 110000 },
        { year: 2026, month: 8, searchVolume: 90500 },
      ],
      trend: { monthly: -18, quarterly: -18, yearly: 22 },
      serpItemTypes: null,
      resultsCount: null,
      wordsCount: 2,
      coreKeyword: null,
      updatedAt: "2026-09-20T03:41:12.000Z",
    });
    expect(result.items.map((item) => item.keyword)).toEqual([
      "filtre kahve makinesi",
      "kahve makinesi tavsiye",
      "kahve makinesi yedek parça",
    ]);
    // Unknown intents are dropped; missing metrics stay null.
    expect(result.items[1]).toMatchObject({
      intent: "informational",
      secondaryIntents: ["commercial"],
      competitionLevel: "LOW",
      coreKeyword: "kahve makinesi önerisi",
    });
    expect(result.items[2]).toMatchObject({
      searchVolume: null,
      keywordDifficulty: null,
      intent: null,
      monthlySearches: [],
      trend: null,
      updatedAt: null,
    });
  });
});

describe("getRelatedKeywords", () => {
  it("returns related keywords with their depth", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-related-keywords") });
    const result = await getRelatedKeywords(testClient(fetch), {
      ...market,
      keyword: "kahve makinesi",
      depth: 1,
      limit: 2,
    });
    expect(calls[0]?.body).toEqual([
      { keyword: "kahve makinesi", location_code: 2792, language_code: "tr", limit: 2, depth: 1 },
    ]);
    expect(result.seed).toBeNull();
    expect(result.totalCount).toBe(8);
    expect(result.items[0]).toMatchObject({
      keyword: "espresso makinesi",
      searchVolume: 60500,
      depth: 1,
      related: ["espresso makinesi fiyat", "ev tipi espresso makinesi"],
    });
    expect(result.items[1]).toMatchObject({ keyword: "türk kahvesi makinesi", related: [] });
  });

  it("rejects an unsupported depth", async () => {
    const { fetch } = fakeFetch();
    await expect(
      getRelatedKeywords(testClient(fetch), { ...market, keyword: "kahve", depth: 5 }),
    ).rejects.toThrow(RangeError);
  });
});

describe("getKeywordOverview", () => {
  it("returns metrics for the keywords DataForSEO knows", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-keyword-overview") });
    const result = await getKeywordOverview(testClient(fetch), {
      ...market,
      keywords: ["kahve makinesi", "espresso makinesi", "kahve makinesi", " "],
      includeSerpInfo: true,
    });
    expect(calls[0]?.body).toEqual([
      {
        keywords: ["kahve makinesi", "espresso makinesi"],
        location_code: 2792,
        language_code: "tr",
        include_serp_info: true,
      },
    ]);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      keyword: "kahve makinesi",
      serpItemTypes: ["ai_overview", "paid", "organic", "people_also_ask", "local_pack"],
      resultsCount: 48200000,
      keywordDifficulty: 54,
    });
  });

  it("validates the keyword list", async () => {
    const { fetch, calls } = fakeFetch();
    const client = testClient(fetch);
    await expect(getKeywordOverview(client, { ...market, keywords: [] })).rejects.toThrow(
      RangeError,
    );
    await expect(
      getKeywordOverview(client, {
        ...market,
        keywords: Array.from({ length: 701 }, (_, index) => `kelime ${index}`),
      }),
    ).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });
});

describe("getKeywordIdeas", () => {
  it("returns ideas for the seed keywords", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-keyword-ideas") });
    const result = await getKeywordIdeas(testClient(fetch), {
      ...market,
      keywords: ["kahve makinesi"],
      limit: 2,
    });
    expect(calls[0]).toMatchObject({
      url: "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_ideas/live",
      body: [{ keywords: ["kahve makinesi"], location_code: 2792, language_code: "tr", limit: 2 }],
    });
    expect(result.totalCount).toBe(5231);
    expect(result.items.map((item) => [item.keyword, item.intent])).toEqual([
      ["kahve değirmeni", "commercial"],
      ["french press", "transactional"],
    ]);
  });

  it("treats an empty result as no ideas and validates the limit", async () => {
    const { fetch } = fakeFetch({ body: envelope({ result: null }) });
    const client = testClient(fetch);
    await expect(getKeywordIdeas(client, { ...market, keywords: ["x"] })).resolves.toEqual({
      totalCount: 0,
      items: [],
      cost: 0,
    });
    await expect(getKeywordIdeas(client, { ...market, keywords: ["x"], limit: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(
      getKeywordIdeas(client, { ...market, keywords: ["x"], limit: 1001 }),
    ).rejects.toThrow(RangeError);
  });
});
