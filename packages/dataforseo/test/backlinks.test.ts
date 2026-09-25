import { describe, expect, it } from "vitest";

import {
  getBacklinks,
  getBacklinksAnchors,
  getBacklinksDomainIntersection,
  getBacklinksHistory,
  getBacklinksNewLostTimeseries,
  getReferringDomains,
} from "../src/index.js";
import { envelope, fakeFetch, fixture, testClient } from "./helpers.js";

const BACKLINKS = "https://api.dataforseo.com/v3/backlinks";
/** What every list endpoint is asked for: live links, no internal ones, ranks on 0–100. */
const LIST = {
  target: "example.com",
  include_subdomains: true,
  backlinks_status_type: "live",
  exclude_internal_backlinks: true,
  rank_scale: "one_hundred",
  limit: 3,
};

describe("getBacklinksHistory", () => {
  it("returns the months oldest first on the 0–100 rank scale", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("backlinks-history") });
    const result = await getBacklinksHistory(testClient(fetch), {
      target: "example.com",
      dateFrom: "2026-07-01",
    });

    expect(calls[0]).toMatchObject({
      url: `${BACKLINKS}/history/live`,
      body: [{ target: "example.com", date_from: "2026-07-01", rank_scale: "one_hundred" }],
    });
    expect(result.cost).toBe(0.024108);
    expect(result.months.map((month) => month.date)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
    expect(result.months[2]).toEqual({
      date: "2026-09-01",
      rank: 42,
      backlinks: 18342,
      referringDomains: 812,
      referringMainDomains: 744,
      newBacklinks: 1204,
      lostBacklinks: 882,
      newReferringDomains: 41,
      lostReferringDomains: 26,
    });
    // Missing counts are zeros, as DataForSEO reports them before May 2021.
    expect(result.months[0]).toMatchObject({ newReferringDomains: 0, lostReferringDomains: 0 });
  });
});

describe("getBacklinksNewLostTimeseries", () => {
  it("asks for days by default and returns them oldest first", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("backlinks-timeseries-new-lost-summary") });
    const result = await getBacklinksNewLostTimeseries(testClient(fetch), {
      target: "example.com",
      dateFrom: "2026-09-21",
      dateTo: "2026-09-24",
    });

    expect(calls[0]).toMatchObject({
      url: `${BACKLINKS}/timeseries_new_lost_summary/live`,
      body: [
        {
          target: "example.com",
          date_from: "2026-09-21",
          date_to: "2026-09-24",
          group_range: "day",
          include_subdomains: true,
        },
      ],
    });
    expect(result.cost).toBe(0.024144);
    expect(result.periods.map((period) => period.date)).toEqual([
      "2026-09-21",
      "2026-09-22",
      "2026-09-23",
      "2026-09-24",
    ]);
    expect(result.periods[1]).toEqual({
      date: "2026-09-22",
      newBacklinks: 18,
      lostBacklinks: 40,
      newReferringDomains: 2,
      lostReferringDomains: 4,
      newReferringMainDomains: 2,
      lostReferringMainDomains: 3,
    });
  });
});

describe("getReferringDomains", () => {
  it("asks for live links by rank and normalizes each domain", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("backlinks-referring-domains") });
    const result = await getReferringDomains(testClient(fetch), {
      target: "example.com",
      limit: 3,
    });

    expect(calls[0]).toMatchObject({
      url: `${BACKLINKS}/referring_domains/live`,
      body: [{ ...LIST, order_by: ["rank,desc"] }],
    });
    expect(result.totalCount).toBe(812);
    expect(result.items[0]).toEqual({
      domain: "haber.example.org",
      rank: 71,
      backlinks: 12,
      referringPages: 9,
      brokenBacklinks: 0,
      spamScore: 0,
      firstSeen: "2019-05-12T09:14:02.000Z",
      lostDate: null,
    });
    expect(result.items[2]).toMatchObject({ domain: "forum.example.com.tr", spamScore: null });
  });

  it("counts links to the exact host only when asked to", async () => {
    const { fetch, calls } = fakeFetch({
      body: envelope({ result: [{ target: "shop.example.com", total_count: 0, items: [] }] }),
    });
    const result = await getReferringDomains(testClient(fetch), {
      target: "shop.example.com",
      includeSubdomains: false,
      limit: 100,
    });
    expect(calls[0]?.body).toEqual([
      {
        ...LIST,
        target: "shop.example.com",
        include_subdomains: false,
        limit: 100,
        order_by: ["rank,desc"],
      },
    ]);
    expect(result).toMatchObject({ totalCount: 0, items: [] });
  });
});

describe("getBacklinks", () => {
  it("groups links one per domain when asked and normalizes each link", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("backlinks-backlinks") });
    const result = await getBacklinks(testClient(fetch), {
      target: "example.com",
      limit: 3,
      mode: "one_per_domain",
    });

    expect(calls[0]).toMatchObject({
      url: `${BACKLINKS}/backlinks/live`,
      body: [{ ...LIST, mode: "one_per_domain", order_by: ["rank,desc"] }],
    });
    expect(result.totalCount).toBe(812);
    expect(result.items[0]).toEqual({
      domainFrom: "haber.example.org",
      urlFrom: "https://haber.example.org/ekonomi/kahve-fiyatlari-2026",
      pageTitle: "Kahve fiyatları 2026'da nasıl değişti?",
      urlTo: "https://example.com/kahve-makineleri",
      anchor: "kahve makineleri",
      type: "anchor",
      dofollow: true,
      rank: 38,
      domainFromRank: 71,
      firstSeen: "2026-02-11T08:21:40.000Z",
      lastSeen: "2026-09-20T06:44:31.000Z",
      isNew: false,
      isLost: false,
      isBroken: false,
      groupCount: 12,
    });
    expect(result.items[1]).toMatchObject({
      type: "image",
      anchor: null,
      pageTitle: null,
      isNew: true,
    });
    expect(result.items[2]).toMatchObject({ dofollow: false, isBroken: true });
  });
});

describe("getBacklinksAnchors", () => {
  it("asks for anchors by referring domains and keeps empty anchors", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("backlinks-anchors") });
    const result = await getBacklinksAnchors(testClient(fetch), {
      target: "example.com",
      limit: 3,
    });

    expect(calls[0]).toMatchObject({
      url: `${BACKLINKS}/anchors/live`,
      body: [{ ...LIST, order_by: ["referring_domains,desc"] }],
    });
    expect(result.totalCount).toBe(530);
    expect(result.items[0]).toEqual({
      anchor: "example",
      rank: 38,
      backlinks: 4120,
      referringDomains: 210,
      referringDomainsNofollow: 22,
      firstSeen: "2017-03-04T12:31:00.000Z",
      lostDate: null,
    });
    expect(result.items[1]).toMatchObject({ anchor: "", referringDomains: 96 });
  });
});

describe("getBacklinksDomainIntersection", () => {
  it("finds domains that link to a competitor but not to the own site", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("backlinks-domain-intersection") });
    const result = await getBacklinksDomainIntersection(testClient(fetch), {
      targets: ["rakip-a.example"],
      excludeTargets: ["example.com"],
      limit: 3,
    });

    expect(calls[0]).toMatchObject({
      url: `${BACKLINKS}/domain_intersection/live`,
      body: [
        {
          targets: { "1": "rakip-a.example" },
          exclude_targets: ["example.com"],
          include_subdomains: true,
          backlinks_status_type: "live",
          exclude_internal_backlinks: true,
          rank_scale: "one_hundred",
          limit: 3,
          order_by: ["1.rank,desc"],
        },
      ],
    });
    expect(result.cost).toBe(0.024072);
    expect(result.totalCount).toBe(318);
    expect(result.items).toEqual([
      {
        domain: "dergi.example.org",
        links: [{ rank: 64, backlinks: 7, firstSeen: "2024-04-02T13:12:09.000Z" }],
        intersections: 1,
      },
      {
        domain: "rehber.example.net",
        links: [{ rank: 29, backlinks: 2, firstSeen: "2026-08-30T19:40:00.000Z" }],
        intersections: 1,
      },
    ]);
  });

  it("lists the links to each target by position", async () => {
    const entry = (target: string, rank: number) => ({
      type: "backlinks_domain_intersection",
      target,
      rank,
      backlinks: 3,
      first_seen: "2025-01-02 03:04:05 +00:00",
    });
    const { fetch, calls } = fakeFetch({
      body: envelope({
        result: [
          {
            targets: { "1": "rakip-a.example", "2": "rakip-b.example" },
            total_count: 2,
            items: [
              {
                domain_intersection: {
                  "1": entry("ortak.example.org", 40),
                  "2": entry("ortak.example.org", 35),
                },
                summary: { intersections_count: 2 },
              },
              {
                domain_intersection: { "2": entry("tek.example.org", 12) },
                summary: null,
              },
            ],
          },
        ],
      }),
    });
    const result = await getBacklinksDomainIntersection(testClient(fetch), {
      targets: ["rakip-a.example", "rakip-b.example"],
      limit: 10,
    });

    expect(calls[0]?.body).toEqual([
      expect.not.objectContaining({ exclude_targets: expect.anything() }),
    ]);
    expect(result.items.map((item) => [item.domain, item.intersections])).toEqual([
      ["ortak.example.org", 2],
      ["tek.example.org", 1],
    ]);
    expect(result.items[1]?.links).toEqual([
      null,
      { rank: 12, backlinks: 3, firstSeen: "2025-01-02T03:04:05.000Z" },
    ]);
  });

  it("refuses more targets than DataForSEO accepts", async () => {
    const { fetch } = fakeFetch();
    const client = testClient(fetch);
    await expect(
      getBacklinksDomainIntersection(client, { targets: [], limit: 10 }),
    ).rejects.toThrow(RangeError);
    await expect(
      getBacklinksDomainIntersection(client, {
        targets: ["rakip-a.example"],
        excludeTargets: Array.from({ length: 11 }, (_, index) => `site-${index}.example`),
        limit: 10,
      }),
    ).rejects.toThrow(RangeError);
  });
});
