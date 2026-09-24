import {
  KeywordDetailSchema,
  ProjectDetailSchema,
  RankTrackerDataSchema,
  TrackKeywordsQuoteSchema,
  type ProjectDetail,
} from "@seo-geo/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { DATAFORSEO_OPTIONS } from "../src/credentials/dataforseo.gateway.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { KeywordMetricsService } from "../src/keywords/keyword-metrics.service.js";
import { RankChecksService } from "../src/rank-tracker/rank-checks.service.js";
import {
  TEST_SERVER_URL,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";
import { FAKE_TASK_COST, GOOD_LOGIN, fakeDataForSeo } from "./support/dataforseo.js";

const PASSWORD = "a long enough password";

describe.skipIf(!TEST_SERVER_URL)("rank tracker", () => {
  const dataForSeo = fakeDataForSeo({
    balance: 10,
    serps: {
      "kahve makinesi": {
        aiOverview: ["wikipedia.org", "example.com"],
        featuredSnippet: "example.org",
        organic: [
          ["www.example.org", "/kahve-makinesi"],
          ["tr.wikipedia.org", "/wiki/Kahve"],
          ["www.example.com", "/kahve-makineleri"],
          ["blog.example.com", "/en-iyi"],
        ],
      },
      "espresso makinesi": {
        organic: [
          ["www.example.org", "/espresso"],
          ["notexample.com", "/espresso"],
        ],
      },
    },
    metrics: {
      "kahve makinesi": {
        searchVolume: 110000,
        keywordDifficulty: 54,
        cpc: 0.38,
        intent: "commercial",
      },
      "espresso makinesi": {
        searchVolume: 60500,
        keywordDifficulty: 47,
        cpc: 0.35,
        intent: "commercial",
      },
    },
  });
  let context: IntegrationApp;
  let owner: Agent;
  let viewer: Agent;
  let workspace: string;
  let project: ProjectDetail;

  const api = (path: string) => `/api/v1/workspaces/${workspace}${path}`;
  const tracker = (path = "") => api(`/projects/${project.id}/rank-tracker${path}`);

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
    owner = await signUpVerified(context, {
      name: "Owner",
      email: "owner@example.com",
      password: PASSWORD,
    });
    const created = await owner
      .post("/api/auth/organization/create")
      .send({ name: "Agency", slug: "agency" })
      .expect(200);
    workspace = created.body.id as string;

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

    const response = await owner
      .post(api("/projects"))
      .send({
        name: "Example",
        domain: "example.com",
        locationCode: 2792,
        languageCode: "tr",
        timezone: "Europe/Istanbul",
        competitors: [{ name: "Rival", domains: ["example.org"] }],
      })
      .expect(201);
    project = ProjectDetailSchema.parse(response.body);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it("quotes new keywords with duplicates, invalid entries and costs", async () => {
    const response = await owner
      .post(tracker("/keywords/quote"))
      .send({ keywords: ["Kahve  Makinesi", "kahve makinesi", "", "a ".repeat(50)] })
      .expect(200);
    const quote = TrackKeywordsQuoteSchema.parse(response.body);
    expect(quote.keywords).toEqual(["kahve makinesi"]);
    expect(quote.invalid).toEqual([{ keyword: "a ".repeat(50).trim(), problem: "too_long" }]);
    expect(quote.duplicates).toBe(0);
    // Depth 30 (first page + 2 × 75%) plus the asynchronous AI Overview surcharge.
    expect(quote.checkCostUsd).toBe(0.0021);
    expect(quote.monthlyCostUsd).toBe(0.063);
    expect(quote.metricsCostUsd).toBeGreaterThan(0);
  });

  it("needs a working DataForSEO account to check, and a member role to add", async () => {
    await viewer
      .post(tracker("/keywords"))
      .send({ keywords: ["kahve makinesi"] })
      .expect(403);
    await owner.post(tracker("/check")).expect(409);
    const empty = RankTrackerDataSchema.parse((await viewer.get(tracker()).expect(200)).body);
    expect(empty).toMatchObject({ providerReady: false, keywords: [], summary: { tracked: 0 } });
  });

  it("tracks keywords, posts SERP tasks and collects rankings", async () => {
    await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);
    const added = await owner
      .post(tracker("/keywords"))
      .send({
        keywords: ["kahve makinesi", "Espresso Makinesi", "yok böyle bir kelime"],
        tags: ["ürün"],
      })
      .expect(200);
    expect(added.body).toEqual({ added: 3, duplicates: 0, invalid: 0 });

    // The worker's jobs, run directly.
    const metrics = context.app.get(KeywordMetricsService);
    await metrics.enrich({
      workspaceId: workspace,
      projectId: project.id,
      locationCode: 2792,
      languageCode: "tr",
      keywords: ["kahve makinesi", "espresso makinesi", "yok böyle bir kelime"],
    });
    const checks = context.app.get(RankChecksService);
    await checks.checkProject(project.id);
    const posts = dataForSeo.requests.filter((r) => r.path.endsWith("/task_post"));
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual([
      expect.objectContaining({
        keyword: "kahve makinesi",
        location_code: 2792,
        language_code: "tr",
        device: "desktop",
        depth: 30,
        load_async_ai_overview: true,
      }),
      expect.objectContaining({ keyword: "espresso makinesi" }),
      expect.objectContaining({ keyword: "yok böyle bir kelime" }),
    ]);

    const pending = RankTrackerDataSchema.parse((await viewer.get(tracker()).expect(200)).body);
    expect(pending.summary.pendingChecks).toBe(3);

    await checks.collect();
    const data = RankTrackerDataSchema.parse((await viewer.get(tracker()).expect(200)).body);
    const byKeyword = new Map(data.keywords.map((keyword) => [keyword.keyword, keyword]));
    const kahve = byKeyword.get("kahve makinesi");
    const espresso = byKeyword.get("espresso makinesi");
    const unknown = byKeyword.get("yok böyle bir kelime");
    expect(kahve).toMatchObject({
      keyword: "kahve makinesi",
      tags: ["ürün"],
      pending: false,
      metrics: { searchVolume: 110000, keywordDifficulty: 54, cpc: 0.38, intent: "commercial" },
      latest: {
        position: 3,
        url: "https://www.example.com/kahve-makineleri",
        depth: 30,
        aiOverviewPresent: true,
        aiOverviewCited: true,
        ownedFeatures: ["ai_overview"],
      },
      competitors: { [project.brands[1]?.id as string]: 1 },
    });
    expect(kahve?.latest?.serpFeatures).toEqual(["ai_overview", "featured_snippet", "organic"]);
    // notexample.com is not example.com.
    expect(espresso).toMatchObject({ latest: { position: null, aiOverviewPresent: false } });
    // Google had no results and DataForSEO no metrics: checked, not ranking, empty metrics
    // (stored so they are not requested again).
    expect(unknown).toMatchObject({
      latest: { position: null },
      metrics: { searchVolume: null, keywordDifficulty: null },
    });
    expect(data.summary).toMatchObject({
      tracked: 3,
      checked: 3,
      ranking: 1,
      top3: 1,
      top10: 1,
      averagePosition: 3,
      aiOverviews: 1,
      aiOverviewCitations: 1,
      pendingChecks: 0,
    });
    expect(data.summary.shareOfVoice.map((entry) => [entry.kind, entry.ranking])).toEqual([
      ["OWN", 1],
      ["COMPETITOR", 2],
    ]);

    const prisma = context.app.get(PrismaService);
    const ledger = await prisma.usageEntry.findMany({
      where: { workspaceId: workspace },
      orderBy: { createdAt: "asc" },
    });
    expect(ledger.map((entry) => [entry.operation, entry.units, entry.costUsd.toNumber()])).toEqual(
      [
        ["labs.keyword_overview", 2, 0.0125],
        ["serp.google.organic.task_post", 3, Number((FAKE_TASK_COST * 3).toFixed(4))],
      ],
    );

    // Checking again the same day posts nothing.
    await checks.checkProject(project.id);
    expect(dataForSeo.requests.filter((r) => r.path.endsWith("/task_post"))).toHaveLength(1);
  });

  it("reuses a SERP fetched earlier the same day at no cost", async () => {
    const second = ProjectDetailSchema.parse(
      (
        await owner
          .post(api("/projects"))
          .send({
            name: "Blog",
            domain: "blog.example.com",
            includeSubdomains: false,
            locationCode: 2792,
            languageCode: "tr",
          })
          .expect(201)
      ).body,
    );
    await owner
      .post(api(`/projects/${second.id}/rank-tracker/keywords`))
      .send({ keywords: ["kahve makinesi"] })
      .expect(200);
    await context.app.get(RankChecksService).checkProject(second.id);
    expect(dataForSeo.requests.filter((r) => r.path.endsWith("/task_post"))).toHaveLength(1);

    const data = RankTrackerDataSchema.parse(
      (await viewer.get(api(`/projects/${second.id}/rank-tracker`)).expect(200)).body,
    );
    expect(data.keywords[0]?.latest).toMatchObject({
      position: 4,
      url: "https://blog.example.com/en-iyi",
      aiOverviewCited: false,
    });
  });

  it("shows a keyword's history and the latest SERP with brand attribution", async () => {
    const data = RankTrackerDataSchema.parse((await viewer.get(tracker()).expect(200)).body);
    const keyword = data.keywords.find((entry) => entry.keyword === "kahve makinesi");
    const response = await viewer.get(tracker(`/keywords/${keyword?.id}?days=30`)).expect(200);
    const detail = KeywordDetailSchema.parse(response.body);
    expect(detail.history).toHaveLength(1);
    expect(detail.serp?.results.map((result) => [result.position, result.entityId])).toEqual([
      [1, project.brands[1]?.id],
      [2, null],
      [3, project.brands[0]?.id],
      [4, project.brands[0]?.id],
    ]);
    expect(
      detail.serp?.aiOverview?.references.map((reference) => [
        reference.domain,
        reference.entityId,
      ]),
    ).toEqual([
      ["www.wikipedia.org", null],
      ["www.example.com", project.brands[0]?.id],
    ]);
  });

  it("fetches metrics older than 30 days again with the daily check", async () => {
    const prisma = context.app.get(PrismaService);
    const metrics = context.app.get(KeywordMetricsService);
    const checks = context.app.get(RankChecksService);
    const market = { locationCode: 2792, languageCode: "tr" };
    await prisma.keywordMetric.updateMany({
      where: { keyword: "kahve makinesi", ...market },
      data: { fetchedAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    expect(await metrics.stale(market, ["kahve makinesi", "espresso makinesi"])).toEqual([
      "kahve makinesi",
    ]);

    const requested = vi.spyOn(metrics, "requestEnrichment");
    try {
      await checks.checkProject(project.id, new Date(Date.now() + 86_400_000));
      expect(requested).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: workspace,
          projectId: project.id,
          ...market,
          keywords: expect.arrayContaining(["kahve makinesi", "espresso makinesi"]),
        }),
      );
    } finally {
      requested.mockRestore();
    }
    const overview = dataForSeo.requests.filter((r) => r.path.endsWith("/keyword_overview/live"));
    const before = overview.length;
    await metrics.enrich({
      workspaceId: workspace,
      projectId: project.id,
      ...market,
      keywords: ["kahve makinesi", "espresso makinesi"],
    });
    const after = dataForSeo.requests.filter((r) => r.path.endsWith("/keyword_overview/live"));
    // Only the stale keyword is requested.
    expect(after).toHaveLength(before + 1);
    expect(after.at(-1)?.body).toEqual([expect.objectContaining({ keywords: ["kahve makinesi"] })]);
    expect(await metrics.stale(market, ["kahve makinesi"])).toEqual([]);
  });

  it("updates, blocks over budget and deletes keywords", async () => {
    const data = RankTrackerDataSchema.parse((await viewer.get(tracker()).expect(200)).body);
    const first = data.keywords.find((entry) => entry.keyword === "kahve makinesi");
    const second = data.keywords.find((entry) => entry.keyword === "espresso makinesi");
    await owner
      .patch(tracker(`/keywords/${first?.id}`))
      .send({ targetUrl: "https://www.example.com/kahve", frequency: "WEEKLY" })
      .expect(204);
    await owner
      .patch(tracker(`/keywords/${first?.id}`))
      .send({ targetUrl: "javascript:alert(1)" })
      .expect(400);

    await owner.put(api("/budget")).send({ monthlyLimitUsd: 0.01, hardStop: true }).expect(200);
    const blocked = await owner
      .post(tracker("/keywords"))
      .send({ keywords: Array.from({ length: 20 }, (_, index) => `yeni kelime ${index}`) })
      .expect(402);
    expect(blocked.body.code).toBe("budget_exceeded");

    const removed = await owner
      .post(tracker("/keywords/delete"))
      .send({ ids: [first?.id, second?.id] })
      .expect(200);
    expect(removed.body).toEqual({ deleted: 2 });
    const after = RankTrackerDataSchema.parse((await viewer.get(tracker()).expect(200)).body);
    expect(after.keywords.map((keyword) => keyword.keyword)).toEqual(["yok böyle bir kelime"]);
    expect(after.keywords[0]).toMatchObject({ frequency: "DAILY" });
  });
});
