import {
  KeywordListDetailSchema,
  KeywordListSchema,
  KeywordResearchQuoteSchema,
  KeywordResearchResultSchema,
} from "@seo-geo/contracts";
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
import { GOOD_LOGIN, UNSUPPORTED_LOCATION, fakeDataForSeo } from "./support/dataforseo.js";

const PASSWORD = "a long enough password";
const market = { locationCode: 2792, languageCode: "tr" };

describe.skipIf(!TEST_SERVER_URL)("keyword research", () => {
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
      "kahve makinesi tavsiye": {
        searchVolume: 2900,
        keywordDifficulty: 12,
        cpc: 0.11,
        intent: "informational",
      },
      "french press": {
        searchVolume: 40500,
        keywordDifficulty: 33,
        cpc: 0.19,
        intent: "transactional",
      },
    },
  });
  let context: IntegrationApp;
  let owner: Agent;
  let viewer: Agent;
  let workspace: string;

  const api = (path: string) => `/api/v1/workspaces/${workspace}${path}`;
  const labsCalls = () => dataForSeo.requests.filter((r) => r.path.includes("dataforseo_labs"));

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
    const request = { mode: "suggestions", keyword: "kahve makinesi", ...market };
    await viewer.post(api("/research/keywords")).send(request).expect(403);
    const missing = await owner.post(api("/research/keywords")).send(request).expect(409);
    expect(missing.body.code).toBe("provider_error");
  });

  it("quotes, runs and caches research, and stores the metrics", async () => {
    await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);
    const request = { mode: "suggestions", keyword: "  Kahve Makinesi ", ...market };

    const quote = KeywordResearchQuoteSchema.parse(
      (await owner.post(api("/research/keywords/quote")).send(request).expect(200)).body,
    );
    expect(quote).toEqual({ cached: false, estimatedCostUsd: 0.024 });

    const first = KeywordResearchResultSchema.parse(
      (await owner.post(api("/research/keywords")).send(request).expect(200)).body,
    );
    expect(first).toMatchObject({
      mode: "suggestions",
      keyword: "kahve makinesi",
      cached: false,
      seed: { keyword: "kahve makinesi", searchVolume: 110000, intent: "commercial" },
      totalCount: 2,
    });
    expect(first.items.map((item) => item.keyword)).toEqual([
      "filtre kahve makinesi",
      "kahve makinesi tavsiye",
    ]);
    expect(first.costUsd).toBeCloseTo(0.0125 + 2 * 0.00012, 6);
    expect(labsCalls()).toHaveLength(1);

    const second = KeywordResearchResultSchema.parse(
      (await owner.post(api("/research/keywords")).send(request).expect(200)).body,
    );
    expect(second).toMatchObject({ cached: true, costUsd: 0, fetchedAt: first.fetchedAt });
    expect(second.items).toEqual(first.items);
    expect(labsCalls()).toHaveLength(1);
    const cachedQuote = await owner.post(api("/research/keywords/quote")).send(request).expect(200);
    expect(cachedQuote.body).toEqual({ cached: true, estimatedCostUsd: 0 });

    const prisma = context.app.get(PrismaService);
    const stored = await prisma.keywordMetric.findMany({ orderBy: { keyword: "asc" } });
    expect(stored.map((row) => [row.keyword, row.searchVolume])).toEqual([
      ["filtre kahve makinesi", 49500],
      ["kahve makinesi", 110000],
      ["kahve makinesi tavsiye", 2900],
    ]);
    const ledger = await prisma.usageEntry.findMany({ where: { workspaceId: workspace } });
    expect(ledger.map((entry) => [entry.operation, entry.units])).toEqual([
      ["labs.keyword_suggestions", 2],
    ]);
  });

  it("returns ideas and related keywords", async () => {
    const ideas = KeywordResearchResultSchema.parse(
      (
        await owner
          .post(api("/research/keywords"))
          .send({ mode: "ideas", keyword: "kahve makinesi", ...market, limit: 10 })
          .expect(200)
      ).body,
    );
    expect(ideas.items.map((item) => item.keyword)).toContain("french press");
    const related = KeywordResearchResultSchema.parse(
      (
        await owner
          .post(api("/research/keywords"))
          .send({ mode: "related", keyword: "kahve makinesi", ...market })
          .expect(200)
      ).body,
    );
    expect(related.items.length).toBeGreaterThan(0);
  });

  it("reports refused requests as provider errors", async () => {
    const response = await owner
      .post(api("/research/keywords"))
      .send({
        mode: "ideas",
        keyword: "kahve",
        locationCode: UNSUPPORTED_LOCATION,
        languageCode: "tr",
      })
      .expect(422);
    expect(response.body).toMatchObject({ code: "provider_error" });
  });

  it("keeps keyword lists with metrics", async () => {
    const created = KeywordListSchema.parse(
      (
        await owner
          .post(api("/keyword-lists"))
          .send({
            name: "Kahve",
            items: [
              { keyword: "Kahve Makinesi", ...market },
              { keyword: "kahve makinesi", ...market },
              { keyword: "bilinmeyen kelime", ...market },
            ],
          })
          .expect(201)
      ).body,
    );
    expect(created.itemCount).toBe(2);

    await owner
      .post(api(`/keyword-lists/${created.id}/items`))
      .send({ items: [{ keyword: "filtre kahve makinesi", ...market }] })
      .expect(200);
    await owner
      .post(api(`/keyword-lists/${created.id}/items/delete`))
      .send({ items: [{ keyword: "bilinmeyen kelime", ...market }] })
      .expect(200);
    await owner
      .patch(api(`/keyword-lists/${created.id}`))
      .send({ name: "Kahve makineleri" })
      .expect(200);

    const detail = KeywordListDetailSchema.parse(
      (await viewer.get(api(`/keyword-lists/${created.id}`)).expect(200)).body,
    );
    expect(detail).toMatchObject({ name: "Kahve makineleri", itemCount: 2 });
    expect(detail.items.map((item) => [item.keyword, item.metrics?.searchVolume])).toEqual([
      ["kahve makinesi", 110000],
      ["filtre kahve makinesi", 49500],
    ]);

    const lists = await viewer.get(api("/keyword-lists")).expect(200);
    expect(lists.body.data).toHaveLength(1);
    await viewer.delete(api(`/keyword-lists/${created.id}`)).expect(403);
    await owner.delete(api(`/keyword-lists/${created.id}`)).expect(204);
    await owner.get(api(`/keyword-lists/${created.id}`)).expect(404);
  });
});
