import { describe, expect, it } from "vitest";

import {
  estimateBacklinksCost,
  getBacklinksSummary,
  getCompetitorsDomain,
  getDomainRankOverview,
  getHistoricalRankOverview,
  getRankedKeywords,
} from "../src/index.js";
import { envelope, fakeFetch, fixture, testClient } from "./helpers.js";

const request = { target: "example.com", locationCode: 2792, languageCode: "tr" };
const LABS = "https://api.dataforseo.com/v3/dataforseo_labs/google";

describe("getDomainRankOverview", () => {
  it("normalizes organic and paid metrics with position buckets", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-domain-rank-overview") });
    const result = await getDomainRankOverview(testClient(fetch), request);

    expect(calls[0]).toMatchObject({
      method: "POST",
      url: `${LABS}/domain_rank_overview/live`,
      body: [{ target: "example.com", location_code: 2792, language_code: "tr" }],
    });
    expect(result.cost).toBe(0.01212);
    expect(result.organic).toMatchObject({
      keywords: 6880,
      traffic: 18432.7,
      trafficCostUsd: 5230.18,
      newKeywords: 212,
      upKeywords: 604,
      downKeywords: 488,
      lostKeywords: 173,
    });
    expect(result.organic?.positions.slice(0, 4)).toEqual([
      { from: 1, to: 1, keywords: 42 },
      { from: 2, to: 3, keywords: 118 },
      { from: 4, to: 10, keywords: 596 },
      { from: 11, to: 20, keywords: 1204 },
    ]);
    expect(result.organic?.positions).toHaveLength(12);
    expect(result.paid?.keywords).toBe(14);
  });

  it("returns no metrics for a domain Labs does not know", async () => {
    const { fetch } = fakeFetch({
      body: envelope({
        result: [{ target: "unknown.example", total_count: 0, items_count: 0, items: [] }],
      }),
    });
    const result = await getDomainRankOverview(testClient(fetch), {
      ...request,
      target: "unknown.example",
    });
    expect(result).toMatchObject({ organic: null, paid: null });
  });
});

describe("getHistoricalRankOverview", () => {
  it("returns months oldest first from the requested date", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-historical-rank-overview") });
    const result = await getHistoricalRankOverview(testClient(fetch), {
      ...request,
      dateFrom: "2026-06-01",
    });

    expect(calls[0]?.body).toEqual([{ ...labsBody(), date_from: "2026-06-01" }]);
    expect(
      result.months.map((month) => [month.year, month.month, month.organic?.keywords]),
    ).toEqual([
      [2026, 6, 6190],
      [2026, 7, 6532],
      [2026, 8, 6880],
    ]);
  });
});

describe("getRankedKeywords", () => {
  it("asks for organic results by traffic and normalizes each keyword", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-ranked-keywords") });
    const result = await getRankedKeywords(testClient(fetch), { ...request, limit: 3 });

    expect(calls[0]).toMatchObject({
      url: `${LABS}/ranked_keywords/live`,
      body: [
        {
          ...labsBody(),
          item_types: ["organic"],
          limit: 3,
          order_by: ["ranked_serp_element.serp_item.etv,desc"],
        },
      ],
    });
    expect(result.totalCount).toBe(6880);
    expect(result.items[0]).toEqual({
      keyword: "kahve makinesi",
      searchVolume: 110000,
      cpc: 0.38,
      keywordDifficulty: 54,
      intent: "commercial",
      position: 3,
      rankAbsolute: 5,
      url: "https://example.com/kahve-makineleri",
      traffic: 4620,
      previousRankAbsolute: 7,
      isNew: false,
      updatedAt: "2026-09-18T11:02:33.000Z",
    });
    expect(result.items[2]).toMatchObject({
      keyword: "filtre kahve nasıl yapılır",
      cpc: null,
      intent: "informational",
      position: 1,
      previousRankAbsolute: null,
      isNew: true,
    });
  });
});

describe("getCompetitorsDomain", () => {
  it("leaves the target out of its competitors", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("labs-competitors-domain") });
    const result = await getCompetitorsDomain(testClient(fetch), { ...request, limit: 2 });

    expect(calls[0]?.body).toEqual([
      { ...labsBody(), limit: 3, exclude_top_domains: true, order_by: ["intersections,desc"] },
    ]);
    expect(
      result.items.map((item) => [item.domain, item.commonKeywords, item.avgPosition]),
    ).toEqual([
      ["rakip-a.example", 2410, 24.2],
      ["rakip-b.example", 1180, 29.8],
    ]);
    expect(result.items[0]?.organic?.traffic).toBe(22110.4);
  });
});

describe("getBacklinksSummary", () => {
  it("asks for live links on the 0–100 rank scale and normalizes the profile", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("backlinks-summary") });
    const result = await getBacklinksSummary(testClient(fetch), { target: "example.com" });

    expect(calls[0]).toMatchObject({
      url: "https://api.dataforseo.com/v3/backlinks/summary/live",
      body: [
        {
          target: "example.com",
          include_subdomains: true,
          backlinks_status_type: "live",
          rank_scale: "one_hundred",
          internal_list_limit: 10,
        },
      ],
    });
    expect(result.cost).toBe(0.024036);
    expect(result.summary).toEqual({
      target: "example.com",
      rank: 42,
      backlinks: 18342,
      referringDomains: 812,
      referringDomainsNofollow: 133,
      referringMainDomains: 744,
      referringIps: 690,
      referringSubnets: 601,
      referringPages: 15320,
      brokenBacklinks: 214,
      brokenPages: 18,
      spamScore: 6,
      firstSeen: "2017-03-04T12:31:00.000Z",
      crawledPages: 3120,
    });
  });

  it("estimates requests and rows at the pay-as-you-go rates", () => {
    expect(estimateBacklinksCost({ rows: 1 })).toBe(0.024036);
    expect(estimateBacklinksCost({ rows: 1000 })).toBe(0.06);
    expect(estimateBacklinksCost({ rows: 200, requests: 2 })).toBe(0.0552);
  });
});

function labsBody() {
  return { target: "example.com", location_code: 2792, language_code: "tr" };
}
