import { DomainOverviewQuoteSchema, DomainOverviewSchema } from "@seo-geo/contracts";
import { estimateBacklinksCost, estimateLabsCost, roundUsd } from "@seo-geo/dataforseo";
import { Prisma } from "@seo-geo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DATAFORSEO_OPTIONS } from "../src/credentials/dataforseo.gateway.js";
import { PrismaService } from "../src/database/prisma.service.js";
import {
  TEST_SERVER_URL,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";
import {
  FAKE_BACKLINKS_COST,
  FAKE_LABS_COST,
  GOOD_LOGIN,
  UNSUPPORTED_LOCATION,
  fakeDataForSeo,
} from "./support/dataforseo.js";

const PASSWORD = "a long enough password";
const market = { locationCode: 2792, languageCode: "tr" };
const BACKLINKS_PATH = "/backlinks/summary/live";
/** Upper bound of a whole overview: 1 + 12 + 100 + 11 Labs items and one backlinks row. */
const FULL_ESTIMATE = roundUsd(
  estimateLabsCost({ items: 1 }) +
    estimateLabsCost({ items: 12 }) +
    estimateLabsCost({ items: 100 }) +
    estimateLabsCost({ items: 11 }) +
    estimateBacklinksCost({ rows: 1 }),
);

/** First day of the month `offset` months from now (YYYY-MM-01, UTC). */
function month(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 10);
}

describe.skipIf(!TEST_SERVER_URL)("domain overview", () => {
  const dataForSeo = fakeDataForSeo({
    balance: 10,
    metrics: {
      "kahve makinesi": {
        searchVolume: 110000,
        keywordDifficulty: 54,
        cpc: 0.38,
        intent: "commercial",
      },
      "filtre kahve makinesi": {
        searchVolume: 49500,
        keywordDifficulty: 38,
        cpc: 0.29,
        intent: "commercial",
      },
    },
    domains: {
      "example.com": {
        positions: [42, 118, 596, 1204],
        traffic: 18432.7,
        history: [
          { keywords: 1500, traffic: 15000, top10: 600 },
          { keywords: 1700, traffic: 16500.5, top10: 700 },
          { keywords: 1960, traffic: 18432.7, top10: 756 },
        ],
        keywords: [
          ["kahve makinesi", 3, 4620, 5],
          ["filtre kahve makinesi", 6, 1210.4, 4],
          ["filtre kahve nasıl yapılır", 1, 880],
        ],
        competitors: [
          ["example.com", 1960, 18.1],
          ["rakip-a.example", 820, 24.2],
          ["rakip-b.example", 410, 29.8],
        ],
        backlinks: { rank: 42, backlinks: 18342, referringDomains: 812 },
      },
      "rakip-a.example": {
        positions: [80, 210, 900, 1500],
        traffic: 22110.4,
        backlinks: { rank: 51, backlinks: 40210, referringDomains: 1904 },
      },
    },
  });
  let context: IntegrationApp;
  let prisma: PrismaService;
  let owner: Agent;
  let viewer: Agent;
  let workspace: string;

  const api = (path: string) => `/api/v1/workspaces/${workspace}${path}`;
  const providerCalls = () =>
    dataForSeo.requests.filter((request) => !request.path.endsWith("/appendix/user_data"));
  const ledger = async () =>
    (
      await prisma.usageEntry.findMany({
        where: { workspaceId: workspace },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => [entry.operation, entry.units, Number(entry.costUsd)]);

  beforeAll(async () => {
    context = await createIntegrationApp({
      env: { DEPLOYMENT_MODE: "cloud", SMTP_HOST: "smtp.invalid" },
      overrides: [
        {
          provide: DATAFORSEO_OPTIONS,
          useValue: { fetch: dataForSeo.fetch, sleep: async () => {} },
        },
      ],
    });
    prisma = context.app.get(PrismaService);
    owner = await signUpVerified(context, {
      name: "Owner",
      email: "owner@example.com",
      password: PASSWORD,
    });
    workspace = (
      await owner
        .post("/api/auth/organization/create")
        .send({ name: "Agency", slug: "agency" })
        .expect(200)
    ).body.id as string;
    viewer = await signUpVerified(context, {
      name: "Viewer",
      email: "viewer@example.com",
      password: PASSWORD,
    });
    await owner
      .post("/api/auth/organization/invite-member")
      .send({ email: "viewer@example.com", role: "viewer", organizationId: workspace })
      .expect(200);
    const invitationId = context.mailer.lastLinkPath("viewer@example.com").split("/").pop();
    await viewer
      .post("/api/auth/organization/accept-invitation")
      .send({ invitationId })
      .expect(200);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it("needs credentials and at least the member role", async () => {
    const request = { domain: "example.com", ...market };
    await viewer.post(api("/research/domains/quote")).send(request).expect(403);
    await viewer.post(api("/research/domains")).send(request).expect(403);
    const missing = await owner.post(api("/research/domains")).send(request).expect(409);
    expect(missing.body.code).toBe("provider_error");
    expect(providerCalls()).toHaveLength(0);
  });

  it("rejects what is not a domain before asking anyone", async () => {
    const response = await owner
      .post(api("/research/domains/quote"))
      .send({ domain: "not a domain", ...market })
      .expect(400);
    expect(response.body).toMatchObject({
      code: "validation_failed",
      errors: [{ path: "domain", message: "Enter a domain such as example.com." }],
    });
  });

  it("quotes, runs and caches an overview of a domain", async () => {
    await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);
    const request = { domain: "https://www.Example.com/kahve?ref=x", ...market };

    const quote = DomainOverviewQuoteSchema.parse(
      (await owner.post(api("/research/domains/quote")).send(request).expect(200)).body,
    );
    expect(quote).toEqual({
      domain: "example.com",
      cached: false,
      estimatedCostUsd: FULL_ESTIMATE,
    });

    const first = DomainOverviewSchema.parse(
      (await owner.post(api("/research/domains")).send(request).expect(200)).body,
    );
    expect(first).toMatchObject({ domain: "example.com", ...market });
    expect(first.organic).toMatchObject({
      keywords: 1960,
      traffic: 18432.7,
      trafficCostUsd: 4608.18,
      newKeywords: 12,
      upKeywords: 30,
      downKeywords: 21,
      lostKeywords: 9,
    });
    expect(first.organic?.positions.slice(0, 4)).toEqual([
      { from: 1, to: 1, keywords: 42 },
      { from: 2, to: 3, keywords: 118 },
      { from: 4, to: 10, keywords: 596 },
      { from: 11, to: 20, keywords: 1204 },
    ]);
    expect(first.history).toEqual([
      { month: month(-2), keywords: 1500, traffic: 15000, top10: 600 },
      { month: month(-1), keywords: 1700, traffic: 16500.5, top10: 700 },
      { month: month(0), keywords: 1960, traffic: 18432.7, top10: 756 },
    ]);
    expect(first.topKeywords).toEqual([
      {
        keyword: "kahve makinesi",
        searchVolume: 110000,
        cpc: 0.38,
        keywordDifficulty: 54,
        intent: "commercial",
        position: 3,
        change: 2,
        isNew: false,
        url: "https://example.com/kahve-makinesi",
        traffic: 4620,
      },
      expect.objectContaining({ keyword: "filtre kahve makinesi", position: 6, change: -2 }),
      expect.objectContaining({
        keyword: "filtre kahve nasıl yapılır",
        position: 1,
        change: null,
        isNew: true,
      }),
    ]);
    // The domain itself is not its own competitor; unknown competitors have no metrics.
    expect(first.competitors).toEqual([
      {
        domain: "rakip-a.example",
        commonKeywords: 820,
        avgPosition: 24.2,
        keywords: 2690,
        traffic: 22110.4,
      },
      {
        domain: "rakip-b.example",
        commonKeywords: 410,
        avgPosition: 29.8,
        keywords: null,
        traffic: null,
      },
    ]);
    expect(first.backlinks).toEqual({
      rank: 42,
      backlinks: 18342,
      referringDomains: 812,
      referringDomainsNofollow: 81,
      referringMainDomains: 731,
      referringIps: 650,
      brokenBacklinks: 14,
      spamScore: 6,
      firstSeen: "2017-03-04T12:31:00.000Z",
    });
    expect(first.sources.labs.cached).toBe(false);
    expect(first.sources.backlinks.cached).toBe(false);
    // Competitors are billed as returned, the domain itself included.
    const labsItems = 1 + 3 + 3 + 3;
    expect(first.costUsd).toBeCloseTo(4 * FAKE_LABS_COST + labsItems * 0.00012 + 0.024036, 6);
    expect(first.costUsd).toBeLessThanOrEqual(FULL_ESTIMATE);

    const calls = providerCalls();
    expect(calls.map((call) => call.path.replace("/v3", "")).sort()).toEqual([
      BACKLINKS_PATH,
      "/dataforseo_labs/google/competitors_domain/live",
      "/dataforseo_labs/google/domain_rank_overview/live",
      "/dataforseo_labs/google/historical_rank_overview/live",
      "/dataforseo_labs/google/ranked_keywords/live",
    ]);
    const history = calls.find((call) => call.path.includes("historical_rank_overview"));
    expect(history?.body).toEqual([
      { target: "example.com", location_code: 2792, language_code: "tr", date_from: month(-11) },
    ]);

    expect(await ledger()).toEqual(
      expect.arrayContaining([
        ["labs.domain_rank_overview", 1, expect.any(Number)],
        ["labs.historical_rank_overview", 3, expect.any(Number)],
        ["labs.ranked_keywords", 3, expect.any(Number)],
        ["labs.competitors_domain", 2, expect.any(Number)],
        ["backlinks.summary", 1, FAKE_BACKLINKS_COST],
      ]),
    );

    // The same domain, in any spelling, comes from the cache at no cost.
    const second = DomainOverviewSchema.parse(
      (
        await owner
          .post(api("/research/domains"))
          .send({ domain: "example.com", ...market })
          .expect(200)
      ).body,
    );
    expect(second).toEqual({
      ...first,
      costUsd: 0,
      sources: {
        labs: { ...first.sources.labs, cached: true },
        backlinks: { ...first.sources.backlinks, cached: true },
      },
    });
    expect(providerCalls()).toHaveLength(5);
    expect(await ledger()).toHaveLength(5);
    const cached = await owner
      .post(api("/research/domains/quote"))
      .send({ domain: "www.example.com", ...market })
      .expect(200);
    expect(cached.body).toEqual({ domain: "example.com", cached: true, estimatedCostUsd: 0 });
  });

  it("keeps the parts that succeeded and pays only for the rest on a retry", async () => {
    dataForSeo.state.failingPaths = [BACKLINKS_PATH];
    const request = { domain: "rakip-a.example", ...market };
    const failed = await owner.post(api("/research/domains")).send(request).expect(502);
    expect(failed.body.code).toBe("provider_error");
    expect((await ledger()).length).toBe(5 + 4);

    dataForSeo.state.failingPaths = [];
    const quote = await owner.post(api("/research/domains/quote")).send(request).expect(200);
    expect(quote.body).toEqual({
      domain: "rakip-a.example",
      cached: false,
      estimatedCostUsd: estimateBacklinksCost({ rows: 1 }),
    });
    const before = providerCalls().length;
    const overview = DomainOverviewSchema.parse(
      (await owner.post(api("/research/domains")).send(request).expect(200)).body,
    );
    expect(
      providerCalls()
        .slice(before)
        .map((call) => call.path),
    ).toEqual([`/v3${BACKLINKS_PATH}`]);
    expect(overview).toMatchObject({
      costUsd: FAKE_BACKLINKS_COST,
      organic: { keywords: 2690 },
      backlinks: { rank: 51, referringDomains: 1904 },
      sources: { labs: { cached: true }, backlinks: { cached: false } },
    });
  });

  it("answers for a domain nobody has data on", async () => {
    const overview = DomainOverviewSchema.parse(
      (
        await owner
          .post(api("/research/domains"))
          .send({ domain: "yeni-site.example", ...market })
          .expect(200)
      ).body,
    );
    expect(overview).toMatchObject({
      domain: "yeni-site.example",
      organic: null,
      history: [],
      topKeywords: [],
      competitors: [],
      backlinks: null,
    });
  });

  it("reports refused markets as provider errors", async () => {
    const response = await owner
      .post(api("/research/domains"))
      .send({ domain: "example.com", locationCode: UNSUPPORTED_LOCATION, languageCode: "tr" })
      .expect(422);
    expect(response.body).toMatchObject({ code: "provider_error" });
  });

  it("stops at a hard monthly budget before asking DataForSEO", async () => {
    await prisma.budget.create({
      data: { workspaceId: workspace, monthlyLimitUsd: new Prisma.Decimal(0.2), hardStop: true },
    });
    const before = providerCalls().length;
    const response = await owner
      .post(api("/research/domains"))
      .send({ domain: "rakip-b.example", ...market })
      .expect(402);
    expect(response.body.code).toBe("budget_exceeded");
    expect(providerCalls()).toHaveLength(before);
    // Cached overviews cost nothing and stay available.
    await owner
      .post(api("/research/domains"))
      .send({ domain: "example.com", ...market })
      .expect(200);
    await prisma.budget.delete({ where: { workspaceId: workspace } });
  });
});
