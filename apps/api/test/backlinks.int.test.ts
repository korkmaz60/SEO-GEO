import {
  BacklinkCompetitorsSchema,
  BacklinkCompetitorsStateSchema,
  CreatedWorkspaceApiKeySchema,
  ProjectBacklinksSchema,
  ProjectBacklinksStateSchema,
  ProjectDetailSchema,
  type ProjectDetail,
} from "@seo-geo/contracts";
import { estimateBacklinksCost, estimateLabsCost, roundUsd } from "@seo-geo/dataforseo";
import { Prisma } from "@seo-geo/db";
import request from "supertest";
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
  FAKE_DAILY_NEW_LOST,
  GOOD_LOGIN,
  fakeBacklinksCost,
  fakeDataForSeo,
} from "./support/dataforseo.js";

const PASSWORD = "a long enough password";
const SUMMARY = estimateBacklinksCost({ rows: 1 });
const LINK_GAP = estimateBacklinksCost({ rows: 100 });
/** Upper bound of a profile: summary, 12 months, 30 days and three lists of 100. */
const PROFILE_ESTIMATE = roundUsd(
  SUMMARY +
    estimateBacklinksCost({ rows: 12 }) +
    estimateBacklinksCost({ rows: 30 }) +
    3 * estimateBacklinksCost({ rows: 100 }),
);
const LIST_BODY = {
  target: "example.com",
  include_subdomains: true,
  backlinks_status_type: "live",
  exclude_internal_backlinks: true,
  rank_scale: "one_hundred",
  limit: 100,
};

/** First day of the month `offset` months from now (YYYY-MM-01, UTC). */
function month(offset: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 10);
}

/** The UTC day `offset` days from today (YYYY-MM-DD). */
function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

describe.skipIf(!TEST_SERVER_URL)("project backlinks", () => {
  const dataForSeo = fakeDataForSeo({
    balance: 10,
    domains: {
      "example.com": {
        positions: [42, 118, 596, 1204],
        traffic: 18432.7,
        backlinks: { rank: 42, backlinks: 18342, referringDomains: 812 },
        referringDomains: [
          ["blog.example.net", 58, 431],
          ["haber.example.org", 71, 12],
          ["ortak.example.org", 44, 3],
          ["forum.example.com.tr", 22, 5],
        ],
        anchors: [
          ["example", 210, 4120],
          ["", 96, 1210],
          ["kahve makinesi önerileri", 41, 64],
        ],
      },
      "rakip-a.example": {
        positions: [80, 210, 900, 1500],
        traffic: 22110.4,
        backlinks: { rank: 51, backlinks: 40210, referringDomains: 1904 },
        referringDomains: [
          ["dergi.example.org", 64, 7],
          ["ortak.example.org", 60, 2],
          ["rehber.example.net", 29, 2],
          // A competitor linking to another is no opportunity.
          ["rakip-b.example", 35, 1],
        ],
      },
      "rakip-b.example": {
        positions: [10, 20, 30, 40],
        traffic: 1200,
        backlinks: { rank: 33, backlinks: 2100, referringDomains: 150 },
        referringDomains: [
          ["dergi.example.org", 64, 3],
          ["katalog.example.info", 18, 1],
          ["blog.example.net", 50, 9],
        ],
      },
    },
  });
  let context: IntegrationApp;
  let prisma: PrismaService;
  let owner: Agent;
  let viewer: Agent;
  let workspace: string;
  let project: ProjectDetail;
  let solo: ProjectDetail;

  const api = (path: string) => `/api/v1/workspaces/${workspace}${path}`;
  const backlinks = (target: ProjectDetail, path = "") =>
    api(`/projects/${target.id}/backlinks${path}`);
  const providerCalls = () =>
    dataForSeo.requests.filter((call) => !call.path.endsWith("/appendix/user_data"));
  const ledger = async () =>
    (
      await prisma.usageEntry.findMany({
        where: { workspaceId: workspace },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => [entry.operation, entry.units, Number(entry.costUsd), entry.projectId]);
  const brandId = (name: string) => project.brands.find((brand) => brand.name === name)?.id;

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

    const create = async (body: object) =>
      ProjectDetailSchema.parse(
        (
          await owner
            .post(api("/projects"))
            .send({ locationCode: 2792, languageCode: "tr", ...body })
            .expect(201)
        ).body,
      );
    project = await create({
      name: "Example",
      domain: "example.com",
      competitors: [
        { name: "Rakip A", domains: ["rakip-a.example"] },
        { name: "Rakip B", domains: ["rakip-b.example", "rakip-b-shop.example"] },
      ],
    });
    solo = await create({ name: "Solo", domain: "solo.example" });
    await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it("shows what loading costs until the profile is loaded, to viewers too", async () => {
    const state = ProjectBacklinksStateSchema.parse(
      (await viewer.get(backlinks(project)).expect(200)).body,
    );
    expect(state).toEqual({
      target: "example.com",
      report: null,
      estimatedCostUsd: PROFILE_ESTIMATE,
      refreshCostUsd: PROFILE_ESTIMATE,
    });
    await viewer.post(backlinks(project)).send({}).expect(403);
    await owner.post(backlinks(project)).send({ refresh: "yes" }).expect(400);
    await owner.get(api(`/projects/${crypto.randomUUID()}/backlinks`)).expect(404);
    expect(providerCalls()).toHaveLength(0);
  });

  it("loads the profile, history, new and lost links and the lists", async () => {
    const report = ProjectBacklinksSchema.parse(
      (await owner.post(backlinks(project)).send({}).expect(200)).body,
    );
    expect(report).toMatchObject({
      projectId: project.id,
      target: "example.com",
      includeSubdomains: true,
      profile: {
        rank: 42,
        backlinks: 18342,
        referringDomains: 812,
        referringDomainsNofollow: 81,
        referringMainDomains: 731,
        brokenBacklinks: 14,
        spamScore: 6,
      },
      source: { cached: false },
    });

    // Twelve months up to the current one, oldest first.
    expect(report.history.map((point) => point.month)).toEqual(
      Array.from({ length: 12 }, (_, index) => month(index - 11)),
    );
    expect(report.history.at(-1)).toEqual({
      month: month(0),
      rank: 42,
      backlinks: 18342,
      referringDomains: 812,
      newReferringDomains: 12,
      lostReferringDomains: 7,
      newBacklinks: 120,
      lostBacklinks: 80,
    });
    expect(report.history[0]).toMatchObject({ backlinks: 17242, referringDomains: 757 });

    // The 30 days before today, oldest first.
    expect(report.newLost).toHaveLength(30);
    expect(report.newLost[0]).toEqual({ date: day(-30), ...FAKE_DAILY_NEW_LOST });
    expect(report.newLost.at(-1)?.date).toBe(day(-1));

    expect(report.referringDomains.total).toBe(812);
    expect(report.referringDomains.items.map((item) => [item.domain, item.rank])).toEqual([
      ["haber.example.org", 71],
      ["blog.example.net", 58],
      ["ortak.example.org", 44],
      ["forum.example.com.tr", 22],
    ]);
    expect(report.referringDomains.items[0]).toEqual({
      domain: "haber.example.org",
      rank: 71,
      backlinks: 12,
      spamScore: 4,
      firstSeen: "2024-03-01T10:00:00.000Z",
    });
    expect(report.backlinks.items[0]).toEqual({
      domainFrom: "haber.example.org",
      urlFrom: "https://haber.example.org/yazi",
      pageTitle: "haber.example.org yazısı",
      urlTo: "https://example.com/",
      anchor: "example.com",
      type: "anchor",
      dofollow: true,
      rank: 36,
      domainRank: 71,
      firstSeen: "2024-03-01T10:00:00.000Z",
      lastSeen: expect.any(String),
      isNew: false,
      isBroken: false,
      linksFromDomain: 12,
    });
    expect(report.backlinks.items.at(-1)).toMatchObject({ dofollow: false, domainRank: 22 });
    expect(report.anchors).toEqual({
      total: 3,
      items: [
        {
          anchor: "example",
          referringDomains: 210,
          nofollowDomains: 21,
          backlinks: 4120,
          firstSeen: "2023-05-10T08:00:00.000Z",
        },
        expect.objectContaining({ anchor: "", referringDomains: 96 }),
        expect.objectContaining({ anchor: "kahve makinesi önerileri", nofollowDomains: 4 }),
      ],
    });
    const cost = roundUsd(
      FAKE_BACKLINKS_COST +
        fakeBacklinksCost(12) +
        fakeBacklinksCost(30) +
        2 * fakeBacklinksCost(4) +
        fakeBacklinksCost(3),
    );
    expect(report.costUsd).toBe(cost);
    expect(report.costUsd).toBeLessThanOrEqual(PROFILE_ESTIMATE);

    const calls = providerCalls();
    const body = (path: string) =>
      calls.find((call) => call.path === `/v3/backlinks/${path}`)?.body;
    expect(calls).toHaveLength(6);
    expect(body("history/live")).toEqual([
      { target: "example.com", date_from: month(-11), rank_scale: "one_hundred" },
    ]);
    expect(body("timeseries_new_lost_summary/live")).toEqual([
      {
        target: "example.com",
        date_from: day(-30),
        date_to: day(-1),
        group_range: "day",
        include_subdomains: true,
      },
    ]);
    expect(body("referring_domains/live")).toEqual([{ ...LIST_BODY, order_by: ["rank,desc"] }]);
    expect(body("backlinks/live")).toEqual([
      { ...LIST_BODY, mode: "one_per_domain", order_by: ["rank,desc"] },
    ]);
    expect(body("anchors/live")).toEqual([{ ...LIST_BODY, order_by: ["referring_domains,desc"] }]);

    // Every request is in the ledger, with the project.
    expect(await ledger()).toEqual(
      expect.arrayContaining([
        ["backlinks.summary", 1, FAKE_BACKLINKS_COST, project.id],
        ["backlinks.history", 12, fakeBacklinksCost(12), project.id],
        ["backlinks.timeseries_new_lost_summary", 30, fakeBacklinksCost(30), project.id],
        ["backlinks.referring_domains", 4, fakeBacklinksCost(4), project.id],
        ["backlinks.backlinks", 4, fakeBacklinksCost(4), project.id],
        ["backlinks.anchors", 3, fakeBacklinksCost(3), project.id],
      ]),
    );
    expect(await ledger()).toHaveLength(6);

    // From now on it is free for everyone, viewers included.
    const state = ProjectBacklinksStateSchema.parse(
      (await viewer.get(backlinks(project)).expect(200)).body,
    );
    expect(state).toEqual({
      target: "example.com",
      report: { ...report, costUsd: 0, source: { ...report.source, cached: true } },
      estimatedCostUsd: 0,
      refreshCostUsd: PROFILE_ESTIMATE,
    });
    const again = ProjectBacklinksSchema.parse(
      (await owner.post(backlinks(project)).send({}).expect(200)).body,
    );
    expect(again.costUsd).toBe(0);
    expect(providerCalls()).toHaveLength(6);

    // The domain overview reuses the backlink summary: only its Labs parts are missing.
    const quote = await owner
      .post(api("/research/domains/quote"))
      .send({ domain: "example.com", locationCode: 2792, languageCode: "tr" })
      .expect(200);
    expect(quote.body.estimatedCostUsd).toBe(
      roundUsd(
        estimateLabsCost({ items: 1 }) +
          estimateLabsCost({ items: 12 }) +
          estimateLabsCost({ items: 100 }) +
          estimateLabsCost({ items: 11 }),
      ),
    );
  });

  it("lets read keys see cached data but not load any", async () => {
    const created = await owner
      .post(api("/api-keys"))
      .send({ name: "reader", scopes: ["read"], expiresInDays: 30 })
      .expect(201);
    const key = CreatedWorkspaceApiKeySchema.parse(created.body).key;
    const server = context.app.getHttpServer();
    const state = await request(server).get(backlinks(project)).set("x-api-key", key).expect(200);
    expect(state.body.report).not.toBeNull();
    const refused = await request(server)
      .post(backlinks(project))
      .set("x-api-key", key)
      .send({ refresh: true })
      .expect(403);
    expect(refused.body.detail).toBe("This API key does not have the run:paid scope.");
  });

  it("refreshes every part after the cost is shown, within the budget (D23)", async () => {
    const before = ProjectBacklinksStateSchema.parse(
      (await owner.get(backlinks(project)).expect(200)).body,
    );
    expect(before.refreshCostUsd).toBe(PROFILE_ESTIMATE);

    await prisma.budget.create({
      data: { workspaceId: workspace, monthlyLimitUsd: new Prisma.Decimal(0.2), hardStop: true },
    });
    const calls = providerCalls().length;
    const blocked = await owner.post(backlinks(project)).send({ refresh: true }).expect(402);
    expect(blocked.body.code).toBe("budget_exceeded");
    expect(providerCalls()).toHaveLength(calls);
    await prisma.budget.delete({ where: { workspaceId: workspace } });

    const refreshed = ProjectBacklinksSchema.parse(
      (await owner.post(backlinks(project)).send({ refresh: true }).expect(200)).body,
    );
    expect(providerCalls()).toHaveLength(calls + 6);
    expect(await ledger()).toHaveLength(12);
    expect(refreshed.source.cached).toBe(false);
    expect(refreshed.costUsd).toBeGreaterThan(0);
    expect(Date.parse(refreshed.source.fetchedAt)).toBeGreaterThan(
      Date.parse(before.report?.source.fetchedAt ?? ""),
    );
    // The new data replaced the cached one.
    const after = ProjectBacklinksStateSchema.parse(
      (await viewer.get(backlinks(project)).expect(200)).body,
    );
    expect(after.report?.source.fetchedAt).toBe(refreshed.source.fetchedAt);
  });

  it("compares competitors and finds domains that link only to them", async () => {
    const state = BacklinkCompetitorsStateSchema.parse(
      (await viewer.get(backlinks(project, "/competitors")).expect(200)).body,
    );
    // Each competitor counts with its first domain; the own summary is cached already.
    expect(state).toEqual({
      target: "example.com",
      brands: [
        {
          brandId: brandId("Example"),
          kind: "OWN",
          name: "Example",
          colorSlot: 1,
          domain: "example.com",
        },
        {
          brandId: brandId("Rakip A"),
          kind: "COMPETITOR",
          name: "Rakip A",
          colorSlot: 2,
          domain: "rakip-a.example",
        },
        {
          brandId: brandId("Rakip B"),
          kind: "COMPETITOR",
          name: "Rakip B",
          colorSlot: 3,
          domain: "rakip-b.example",
        },
      ],
      report: null,
      estimatedCostUsd: roundUsd(2 * SUMMARY + 2 * LINK_GAP),
      refreshCostUsd: roundUsd(3 * SUMMARY + 2 * LINK_GAP),
    });
    await viewer.post(backlinks(project, "/competitors")).send({}).expect(403);

    const calls = providerCalls().length;
    const report = BacklinkCompetitorsSchema.parse(
      (await owner.post(backlinks(project, "/competitors")).send({}).expect(200)).body,
    );
    const newCalls = providerCalls().slice(calls);
    expect(newCalls.map((call) => call.path).sort()).toEqual([
      "/v3/backlinks/domain_intersection/live",
      "/v3/backlinks/domain_intersection/live",
      "/v3/backlinks/summary/live",
      "/v3/backlinks/summary/live",
    ]);
    expect(newCalls.find((call) => call.path.endsWith("domain_intersection/live"))?.body).toEqual([
      expect.objectContaining({
        targets: { "1": expect.stringMatching(/^rakip-[ab]\.example$/) },
        exclude_targets: ["example.com"],
        limit: 100,
        order_by: ["1.rank,desc"],
      }),
    ]);

    expect(report.brands.map((brand) => [brand.name, brand.profile?.referringDomains])).toEqual([
      ["Example", 812],
      ["Rakip A", 1904],
      ["Rakip B", 150],
    ]);
    const firstSeen = "2025-06-01T12:00:00.000Z";
    expect(report.linkGap).toEqual([
      {
        domain: "dergi.example.org",
        links: [
          { brandId: brandId("Rakip A"), rank: 64, backlinks: 7, firstSeen },
          { brandId: brandId("Rakip B"), rank: 64, backlinks: 3, firstSeen },
        ],
        rank: 64,
      },
      {
        domain: "rehber.example.net",
        links: [{ brandId: brandId("Rakip A"), rank: 29, backlinks: 2, firstSeen }],
        rank: 29,
      },
      {
        domain: "katalog.example.info",
        links: [{ brandId: brandId("Rakip B"), rank: 18, backlinks: 1, firstSeen }],
        rank: 18,
      },
    ]);
    expect(report.costUsd).toBe(
      roundUsd(2 * FAKE_BACKLINKS_COST + fakeBacklinksCost(3) + fakeBacklinksCost(2)),
    );
    expect(report.source.cached).toBe(false);

    const cached = BacklinkCompetitorsStateSchema.parse(
      (await viewer.get(backlinks(project, "/competitors")).expect(200)).body,
    );
    expect(cached.report).toEqual({
      ...report,
      costUsd: 0,
      source: { fetchedAt: expect.any(String), cached: true },
    });
    expect(cached.estimatedCostUsd).toBe(0);
  });

  it("has nothing to compare without competitors", async () => {
    const state = await owner.get(backlinks(solo, "/competitors")).expect(200);
    expect(state.body).toMatchObject({
      target: "solo.example",
      brands: [{ kind: "OWN", domain: "solo.example" }],
      report: null,
      estimatedCostUsd: 0,
      refreshCostUsd: 0,
    });
    const refused = await owner.post(backlinks(solo, "/competitors")).send({}).expect(409);
    expect(refused.body.detail).toBe(
      "Add competitors in the project settings to compare backlinks.",
    );
  });

  it("keeps the parts that loaded and pays only for the rest on a retry", async () => {
    dataForSeo.state.failingPaths = ["/backlinks/anchors/live"];
    const entries = (await ledger()).length;
    const failed = await owner.post(backlinks(solo)).send({}).expect(502);
    expect(failed.body.code).toBe("provider_error");
    expect(await ledger()).toHaveLength(entries + 5);

    dataForSeo.state.failingPaths = [];
    const state = ProjectBacklinksStateSchema.parse(
      (await owner.get(backlinks(solo)).expect(200)).body,
    );
    expect(state).toMatchObject({
      report: null,
      estimatedCostUsd: estimateBacklinksCost({ rows: 100 }),
    });
    const calls = providerCalls().length;
    const report = ProjectBacklinksSchema.parse(
      (await owner.post(backlinks(solo)).send({}).expect(200)).body,
    );
    expect(
      providerCalls()
        .slice(calls)
        .map((call) => call.path),
    ).toEqual(["/v3/backlinks/anchors/live"]);

    // A site nobody links to: no profile, no lists, days without changes.
    expect(report).toMatchObject({
      target: "solo.example",
      profile: null,
      history: [],
      referringDomains: { total: 0, items: [] },
      backlinks: { total: 0, items: [] },
      anchors: { total: 0, items: [] },
    });
    expect(report.newLost.every((point) => point.newReferringDomains === 0)).toBe(true);
  });
});
