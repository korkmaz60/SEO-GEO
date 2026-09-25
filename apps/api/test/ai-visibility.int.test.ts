import {
  AiCostQuoteSchema,
  AiModelsSchema,
  AiPromptDetailSchema,
  AiPromptListSchema,
  AiSettingsSchema,
  AiSourcesSchema,
  AiVisibilitySummarySchema,
  CreatePromptsQuoteSchema,
  ProjectDetailSchema,
  type ProjectDetail,
} from "@seo-geo/contracts";
import { dateInTimeZone } from "@seo-geo/core";
import { Prisma } from "@seo-geo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AiRunsService } from "../src/ai-visibility/ai-runs.service.js";
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
  FAKE_AI_TASK_COST,
  FAKE_LIVE_COSTS,
  FAKE_TASK_COST,
  GOOD_LOGIN,
  fakeDataForSeo,
} from "./support/dataforseo.js";

const PASSWORD = "a long enough password";
const PROMPT = "Türkiye'de en iyi kahve makinesi markaları hangileri?";
const SECOND = "Espresso makinesi önerir misin?";

describe.skipIf(!TEST_SERVER_URL)("AI visibility", () => {
  const dataForSeo = fakeDataForSeo({
    balance: 10,
    answers: {
      chat_gpt: {
        [PROMPT]: {
          text:
            "Öne çıkan markalar:\n\n1. **Example Store** – geniş seçki " +
            "([example.com](https://www.example.com/kahve)).\n2. **Rakip A** – uygun fiyat.",
          sources: [
            "https://www.example.com/kahve?utm_source=chatgpt.com",
            "https://www.rakip-a.com/blog/en-iyi",
          ],
        },
        [SECOND]: { text: "Mango indirimde; mango.com üzerinden bakın." },
      },
      gemini: {
        [PROMPT]: {
          text: "Rakip A ve De'Longhi sık önerilir.",
          sources: ["https://tr.wikipedia.org/wiki/Kahve"],
        },
      },
      perplexity: {
        [PROMPT]: {
          text: "Example Store öne çıkıyor. Mango ağacı ise tropik bir bitkidir.",
          sources: ["https://www.example.com/kahve"],
        },
      },
      ai_mode: {
        [PROMPT]: {
          text: "**Rakip A** ve **Example Store** önerilir.",
          sources: ["https://www.rakip-a.com/blog/en-iyi", "https://tr.wikipedia.org/wiki/Kahve"],
        },
      },
    },
    serps: {
      [PROMPT]: {
        organic: [["www.example.com", "/kahve"]],
        aiOverview: ["example.com", "wikipedia.org"],
        aiOverviewText: "Example Store kahve makinelerinde öne çıkar.",
      },
    },
    sentiments: { "Example Store": "positive", "Rakip A": "negative" },
  });
  let context: IntegrationApp;
  let owner: Agent;
  let viewer: Agent;
  let workspace: string;
  let project: ProjectDetail;
  let prisma: PrismaService;
  let runs: AiRunsService;

  const api = (path: string) => `/api/v1/workspaces/${workspace}${path}`;
  const ai = (path = "") => api(`/projects/${project.id}/ai-visibility${path}`);
  const posts = () => dataForSeo.requests.filter((request) => request.path.endsWith("/task_post"));
  const lives = () => dataForSeo.requests.filter((request) => request.path.endsWith("/live"));
  const brandId = (name: string) =>
    project.brands.find((brand) => brand.name === name)?.id as string;

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
    runs = context.app.get(AiRunsService);
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
        brand: { name: "Example Store" },
        competitors: [
          { name: "Rakip A", domains: ["rakip-a.com"] },
          { name: "Mango", domains: ["mango.com"], ambiguousAliases: ["Mango"] },
        ],
      })
      .expect(201);
    project = ProjectDetailSchema.parse(response.body);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it("starts with default settings and quotes their cost", async () => {
    const settings = AiSettingsSchema.parse((await viewer.get(ai("/settings")).expect(200)).body);
    expect(settings).toEqual({
      platforms: ["CHATGPT", "GEMINI", "PERPLEXITY", "GOOGLE_AI_MODE", "GOOGLE_AI_OVERVIEW"],
      frequency: "WEEKLY",
      samples: 1,
      models: { CLAUDE: null, PERPLEXITY: null },
      sentiment: false,
    });
    await viewer.patch(ai("/settings")).send({ samples: 2 }).expect(403);
    await owner.patch(ai("/settings")).send({}).expect(400);

    const quote = AiCostQuoteSchema.parse(
      (await owner.post(ai("/settings/quote")).send({ additionalPrompts: 2 }).expect(200)).body,
    );
    expect(quote).toMatchObject({ prompts: 2, answersPerPeriod: 10, sentimentUsd: 0 });
    // Queued answers at list price; Perplexity live with the fallback model "sonar".
    expect(quote.platforms.map((entry) => [entry.platform, entry.costUsd, entry.model])).toEqual([
      ["CHATGPT", 0.0024, null],
      ["GEMINI", 0.0024, null],
      ["PERPLEXITY", 0.0212, "sonar"],
      ["GOOGLE_AI_MODE", 0.0024, null],
      ["GOOGLE_AI_OVERVIEW", 0.0024, null],
    ]);
    expect(quote.perPeriodUsd).toBe(0.0308);
    expect(quote.perMonthUsd).toBe(0.132);
  });

  it("adds prompts once, in the project's market", async () => {
    await viewer
      .post(ai("/prompts"))
      .send({ prompts: [PROMPT] })
      .expect(403);
    const added = await owner
      .post(ai("/prompts"))
      .send({
        prompts: [
          `  ${PROMPT.replace(" en ", "   en\n")} `,
          PROMPT,
          "ab",
          "x".repeat(501),
          "",
          SECOND,
        ],
        tags: ["marka", "marka"],
      })
      .expect(200);
    expect(added.body).toEqual({ added: 2, duplicates: 0, invalid: 2 });
    const quote = CreatePromptsQuoteSchema.parse(
      (
        await owner
          .post(ai("/prompts/quote"))
          .send({ prompts: [PROMPT, "Filtre kahve mi espresso mu?", "x"] })
          .expect(200)
      ).body,
    );
    // One new prompt on five default platforms: 4 × $0.0012 queued + $0.0106 Perplexity.
    expect(quote).toEqual({
      prompts: 1,
      duplicates: 1,
      invalid: 1,
      frequency: "WEEKLY",
      perPeriodUsd: 0.0154,
      perMonthUsd: 0.066,
    });
    const again = await owner
      .post(ai("/prompts"))
      .send({ prompts: [PROMPT] })
      .expect(200);
    expect(again.body).toEqual({ added: 0, duplicates: 1, invalid: 0 });

    const list = AiPromptListSchema.parse((await viewer.get(ai("/prompts")).expect(200)).body);
    expect(list.total).toBe(2);
    expect(list.tags).toEqual(["marka"]);
    expect(
      list.data.map((row) => [row.text, row.locationCode, row.languageCode, row.tags]),
    ).toEqual([
      [PROMPT, 2792, "tr", ["marka"]],
      [SECOND, 2792, "tr", ["marka"]],
    ]);

    // Without DataForSEO nothing is asked, and asking now is refused.
    await runs.checkProject(project.id);
    expect(await prisma.aiRun.count({ where: { projectId: project.id } })).toBe(0);
    await owner.post(ai("/run")).expect(409);
  });

  it("lists the models Claude can answer with, cheapest first", async () => {
    await owner.get(ai("/models/claude")).expect(409);
    await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);
    await owner.get(ai("/models/gpt")).expect(400);
    const models = AiModelsSchema.parse((await owner.get(ai("/models/claude")).expect(200)).body);
    // Models without web search are left out; the fallback name is not listed, so the
    // cheapest listed model is the default.
    expect(models.models).toEqual([
      { name: "claude-haiku-4-5-20251001", estimatedCostUsd: 0.0506, isDefault: true },
      { name: "claude-sonnet-4-5-20250929", estimatedCostUsd: 0.1506, isDefault: false },
    ]);
  });

  it("asks every platform, collects the answers and detects brands", async () => {
    const settings = AiSettingsSchema.parse(
      (
        await owner
          .patch(ai("/settings"))
          .send({
            platforms: [
              "CHATGPT",
              "GEMINI",
              "PERPLEXITY",
              "CLAUDE",
              "GOOGLE_AI_MODE",
              "GOOGLE_AI_OVERVIEW",
            ],
            sentiment: true,
          })
          .expect(200)
      ).body,
    );
    expect(settings).toMatchObject({ sentiment: true, frequency: "WEEKLY" });
    // A page Search Console knows: cited URLs are matched to it.
    await prisma.gscPageDaily.create({
      data: {
        projectId: project.id,
        date: new Date(`${dateInTimeZone(new Date(), "UTC")}T00:00:00Z`),
        page: "https://www.example.com/kahve",
        clicks: 3,
        impressions: 40,
        position: 4.2,
      },
    });

    await runs.checkProject(project.id);
    expect(posts().map((request) => request.path)).toEqual([
      "/v3/ai_optimization/chat_gpt/llm_scraper/task_post",
      "/v3/ai_optimization/gemini/llm_scraper/task_post",
      "/v3/serp/google/ai_mode/task_post",
      "/v3/serp/google/organic/task_post",
    ]);
    const stored = await prisma.aiRun.findMany({ where: { projectId: project.id } });
    expect(stored).toHaveLength(12);
    const promptIds = new Map(
      (await prisma.prompt.findMany({ where: { projectId: project.id } })).map((prompt) => [
        prompt.text,
        prompt.id,
      ]),
    );
    const runOf = (platform: string, text: string) =>
      stored.find((run) => run.platform === platform && run.promptId === promptIds.get(text));
    expect(posts()[0]?.body).toEqual([
      {
        keyword: PROMPT,
        location_code: 2792,
        language_code: "tr",
        tag: runOf("CHATGPT", PROMPT)?.id,
      },
      {
        keyword: SECOND,
        location_code: 2792,
        language_code: "tr",
        tag: runOf("CHATGPT", SECOND)?.id,
      },
    ]);
    expect(posts()[2]?.body).toEqual([
      expect.objectContaining({
        keyword: PROMPT,
        device: "desktop",
        tag: runOf("GOOGLE_AI_MODE", PROMPT)?.id,
      }),
      expect.objectContaining({ keyword: SECOND }),
    ]);
    expect(posts()[3]?.body).toEqual([
      expect.objectContaining({
        keyword: PROMPT,
        depth: 10,
        load_async_ai_overview: true,
        device: "desktop",
        tag: runOf("GOOGLE_AI_OVERVIEW", PROMPT)?.id,
      }),
      expect.objectContaining({ keyword: SECOND, depth: 10 }),
    ]);
    expect(runOf("CLAUDE", PROMPT)).toMatchObject({
      method: "llm_responses",
      model: "claude-haiku-4-5-20251001",
      status: "PENDING",
      postedAt: null,
    });

    let summary = AiVisibilitySummarySchema.parse((await viewer.get(ai()).expect(200)).body);
    expect(summary).toMatchObject({ providerReady: true, pendingRuns: 12, prompts: { total: 2 } });

    // The worker's jobs, run directly.
    await runs.collect();
    await runs.answerLive();
    // Four at a time, so in any order.
    const asked = lives().map((request) => {
      const [body] = request.body as Record<string, unknown>[];
      return { path: request.path, ...body };
    });
    expect(asked).toHaveLength(4);
    expect(asked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/v3/ai_optimization/perplexity/llm_responses/live",
          user_prompt: PROMPT,
          model_name: "sonar",
          web_search_country_iso_code: "TR",
          tag: runOf("PERPLEXITY", PROMPT)?.id,
        }),
        expect.objectContaining({
          path: "/v3/ai_optimization/claude/llm_responses/live",
          user_prompt: PROMPT,
          model_name: "claude-haiku-4-5-20251001",
          web_search: true,
        }),
        expect.objectContaining({
          path: "/v3/ai_optimization/perplexity/llm_responses/live",
          user_prompt: SECOND,
        }),
        expect.objectContaining({
          path: "/v3/ai_optimization/claude/llm_responses/live",
          user_prompt: SECOND,
        }),
      ]),
    );
    // Perplexity always searches; the flag is not part of its request.
    for (const request of asked.filter((entry) => entry.path.includes("perplexity"))) {
      expect(request).not.toHaveProperty("web_search");
    }
    await runs.classifySentiment();

    summary = AiVisibilitySummarySchema.parse((await viewer.get(ai("?days=7")).expect(200)).body);
    expect(summary.pendingRuns).toBe(0);
    expect(summary.brands.map((brand) => [brand.name, brand.kind, brand.colorSlot])).toEqual([
      ["Example Store", "OWN", 1],
      ["Rakip A", "COMPETITOR", 2],
      ["Mango", "COMPETITOR", 3],
    ]);
    const [own, rival, mango] = summary.overall;
    // 12 answers (2 prompts × 6 platforms); the second prompt's mostly have no answer.
    expect(own).toMatchObject({
      entityId: brandId("Example Store"),
      runs: 12,
      shareOfVoice: 0.5,
      averageRank: 1.25,
      score: 29.6,
      lowSample: true,
      previous: null,
      significantChange: false,
    });
    expect(own?.mentionRate?.value).toBeCloseTo(4 / 12);
    expect(own?.citationRate?.value).toBe(0.25);
    expect(rival).toMatchObject({ shareOfVoice: 0.375, averageRank: 4 / 3 });
    expect(rival?.citationRate?.value).toBeCloseTo(2 / 12);
    // "Mango" alone is ambiguous; it counted where mango.com appeared too.
    expect(mango).toMatchObject({ shareOfVoice: 0.125 });

    const byPlatform = new Map(summary.platforms.map((entry) => [entry.platform, entry]));
    expect(summary.platforms.map((entry) => [entry.platform, entry.runs])).toEqual([
      ["CHATGPT", 2],
      ["GEMINI", 2],
      ["PERPLEXITY", 2],
      ["CLAUDE", 2],
      ["GOOGLE_AI_MODE", 2],
      ["GOOGLE_AI_OVERVIEW", 2],
    ]);
    expect(byPlatform.get("CHATGPT")?.brands[0]?.mentionRate?.value).toBe(0.5);
    expect(byPlatform.get("CLAUDE")?.brands[0]?.mentionRate?.value).toBe(0);
    expect(summary.trend.reduce((sum, week) => sum + week.runs, 0)).toBe(12);
    expect(summary.topSources).toEqual([
      { domain: "example.com", citations: 3, share: 0.375, entityId: brandId("Example Store") },
      { domain: "wikipedia.org", citations: 3, share: 0.375, entityId: null },
      { domain: "rakip-a.com", citations: 2, share: 0.25, entityId: brandId("Rakip A") },
    ]);

    // Checking again in the same week asks nothing.
    const postCount = posts().length;
    await runs.checkProject(project.id);
    await runs.checkProject(project.id, new Date(Date.now() + 3 * 86_400_000));
    expect(posts()).toHaveLength(postCount);
  });

  it("shows prompts with the latest answer of each platform", async () => {
    const list = AiPromptListSchema.parse((await viewer.get(ai("/prompts")).expect(200)).body);
    const [first, second] = list.data;
    expect(first).toMatchObject({ text: PROMPT, runs: 6, citationRate: 0.5, pending: false });
    expect(first?.mentionRate).toBeCloseTo(4 / 6);
    expect(
      first?.latest.map((entry) => [
        entry.platform,
        entry.mentioned,
        entry.rank,
        entry.cited,
        entry.competitors,
      ]),
    ).toEqual([
      ["CHATGPT", true, 1, true, 1],
      ["GEMINI", false, null, false, 1],
      ["PERPLEXITY", true, 1, true, 0],
      ["CLAUDE", false, null, false, 0],
      ["GOOGLE_AI_MODE", true, 2, false, 1],
      ["GOOGLE_AI_OVERVIEW", true, 1, true, 0],
    ]);
    expect(second).toMatchObject({ text: SECOND, runs: 6, mentionRate: 0, citationRate: 0 });

    const found = AiPromptListSchema.parse(
      (await viewer.get(ai("/prompts?search=ESPRESSO&tag=marka")).expect(200)).body,
    );
    expect(found.data.map((row) => row.text)).toEqual([SECOND]);
  });

  it("shows a prompt's answers with highlighted mentions, sentiment and citations", async () => {
    const list = AiPromptListSchema.parse((await viewer.get(ai("/prompts")).expect(200)).body);
    const response = await viewer.get(ai(`/prompts/${list.data[0]?.id}`)).expect(200);
    const detail = AiPromptDetailSchema.parse(response.body);
    expect(detail.answers).toHaveLength(6);
    const chatGpt = detail.answers.find((answer) => answer.platform === "CHATGPT");
    expect(chatGpt).toMatchObject({
      status: "COMPLETED",
      method: "llm_scraper",
      model: "gpt-5",
      webSearch: true,
      fanOutQueries: [PROMPT],
      costUsd: FAKE_AI_TASK_COST,
    });
    const answer = chatGpt?.answer ?? "";
    const [ownMention, rivalMention] = chatGpt?.mentions ?? [];
    expect(ownMention).toMatchObject({
      entityId: brandId("Example Store"),
      firstRank: 1,
      mentionCount: 2,
      sentiment: "positive",
    });
    expect(
      ownMention?.spans.map((span) => [answer.slice(span.start, span.end), span.kind]),
    ).toEqual([
      ["Example Store", "name"],
      ["example.com", "domain"],
    ]);
    expect(rivalMention).toMatchObject({ firstRank: 2, sentiment: "negative" });
    expect(chatGpt?.citations).toEqual([
      {
        rank: 1,
        url: "https://www.example.com/kahve?utm_source=chatgpt.com",
        domain: "example.com",
        title: "Page on www.example.com",
        entityId: brandId("Example Store"),
        pageUrl: "https://www.example.com/kahve",
      },
      {
        rank: 2,
        url: "https://www.rakip-a.com/blog/en-iyi",
        domain: "rakip-a.com",
        title: "Page on www.rakip-a.com",
        entityId: brandId("Rakip A"),
        pageUrl: null,
      },
    ]);
    const claude = detail.answers.find((answer) => answer.platform === "CLAUDE");
    expect(claude).toMatchObject({
      status: "COMPLETED",
      answer: null,
      mentions: [],
      citations: [],
    });
    const perplexity = detail.answers.find((answer) => answer.platform === "PERPLEXITY");
    expect(perplexity?.mentions.map((mention) => mention.entityId)).toEqual([
      brandId("Example Store"),
    ]);
    expect(perplexity?.costUsd).toBe(FAKE_LIVE_COSTS.perplexity);
  });

  it("reports cited domains and the own pages they cite", async () => {
    const sources = AiSourcesSchema.parse((await viewer.get(ai("/sources")).expect(200)).body);
    expect(sources.totalCitations).toBe(8);
    expect(
      sources.domains.map((row) => [row.domain, row.citations, row.prompts, row.platforms]),
    ).toEqual([
      ["example.com", 3, 1, ["CHATGPT", "PERPLEXITY", "GOOGLE_AI_OVERVIEW"]],
      ["wikipedia.org", 3, 1, ["GEMINI", "GOOGLE_AI_MODE", "GOOGLE_AI_OVERVIEW"]],
      ["rakip-a.com", 2, 1, ["CHATGPT", "GOOGLE_AI_MODE"]],
    ]);
    expect(sources.pages).toEqual([
      {
        url: "https://www.example.com/kahve",
        citations: 2,
        prompts: 1,
        platforms: ["CHATGPT", "PERPLEXITY"],
        known: true,
      },
      {
        url: "https://www.example.com/guide",
        citations: 1,
        prompts: 1,
        platforms: ["GOOGLE_AI_OVERVIEW"],
        known: false,
      },
    ]);
  });

  it("records every paid request in the usage ledger", async () => {
    const ledger = await prisma.usageEntry.findMany({
      where: { workspaceId: workspace },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const totals = new Map<string, { units: number; cost: number }>();
    for (const entry of ledger) {
      const total = totals.get(entry.operation) ?? { units: 0, cost: 0 };
      total.units += entry.units;
      total.cost += entry.costUsd.toNumber();
      totals.set(entry.operation, total);
    }
    const rounded = (value: number) => Number(value.toFixed(6));
    expect(
      Object.fromEntries(
        [...totals].map(([operation, total]) => [operation, [total.units, rounded(total.cost)]]),
      ),
    ).toEqual({
      "ai_optimization.chat_gpt.llm_scraper.task_post": [2, rounded(2 * FAKE_AI_TASK_COST)],
      "ai_optimization.gemini.llm_scraper.task_post": [2, rounded(2 * FAKE_AI_TASK_COST)],
      "serp.google.ai_mode.task_post": [2, rounded(2 * FAKE_AI_TASK_COST)],
      "serp.google.organic.task_post": [2, rounded(2 * FAKE_TASK_COST)],
      // Only the answered prompt was charged.
      "ai_optimization.perplexity.llm_responses.live": [1, FAKE_LIVE_COSTS.perplexity],
      // Eight mentions classified.
      "ai_optimization.chat_gpt.llm_responses.live": [8, rounded(8 * FAKE_LIVE_COSTS.chat_gpt)],
    });
  });

  it("asks a live platform again later when it fails", async () => {
    dataForSeo.state.failingPlatforms = ["perplexity"];
    dataForSeo.state.answers = {
      ...dataForSeo.state.answers,
      perplexity: { "Kahve çekirdeği nereden alınır?": { text: "Example Store satıyor." } },
    };
    await owner
      .post(ai("/prompts"))
      .send({ prompts: ["Kahve çekirdeği nereden alınır?"] })
      .expect(200);
    await owner
      .patch(ai("/settings"))
      .send({ platforms: ["PERPLEXITY"] })
      .expect(200);
    await runs.checkProject(project.id);
    await runs.answerLive();
    const waiting = await prisma.aiRun.findFirstOrThrow({
      where: {
        projectId: project.id,
        platform: "PERPLEXITY",
        prompt: { text: { startsWith: "Kahve" } },
      },
    });
    expect(waiting).toMatchObject({ status: "PENDING", postedAt: null });

    dataForSeo.state.failingPlatforms = [];
    await runs.answerLive();
    const answered = await prisma.aiRun.findUniqueOrThrow({ where: { id: waiting.id } });
    expect(answered).toMatchObject({ status: "COMPLETED", answer: "Example Store satıyor." });
  });

  it("pauses asking at the monthly budget and says so", async () => {
    await prisma.budget.create({
      data: { workspaceId: workspace, monthlyLimitUsd: new Prisma.Decimal(0.01), hardStop: true },
    });
    await owner
      .post(ai("/prompts"))
      .send({ prompts: ["Filtre kahve makinesi hangisi?"] })
      .expect(402);
    await prisma.prompt.create({
      data: {
        workspaceId: workspace,
        projectId: project.id,
        text: "Filtre kahve makinesi hangisi?",
        locationCode: 2792,
        languageCode: "tr",
      },
    });
    const before = await prisma.aiRun.count({ where: { projectId: project.id } });
    await runs.checkProject(project.id);
    expect(await prisma.aiRun.count({ where: { projectId: project.id } })).toBe(before);
    const notification = await prisma.notification.findFirst({
      where: { workspaceId: workspace, type: "ai.budget_blocked" },
    });
    expect(notification?.data).toMatchObject({ project: "Example", limitUsd: 0.01 });
    await prisma.budget.delete({ where: { workspaceId: workspace } });
  });

  it("deletes prompts with their answers", async () => {
    const list = AiPromptListSchema.parse((await viewer.get(ai("/prompts")).expect(200)).body);
    const second = list.data.find((row) => row.text === SECOND);
    await viewer
      .post(ai("/prompts/delete"))
      .send({ ids: [second?.id] })
      .expect(403);
    await owner
      .patch(ai(`/prompts/${second?.id}`))
      .send({ active: false, tags: ["arşiv"] })
      .expect(204);
    const deleted = await owner
      .post(ai("/prompts/delete"))
      .send({ ids: [second?.id] })
      .expect(200);
    expect(deleted.body).toEqual({ deleted: 1 });
    expect(await prisma.aiRun.count({ where: { promptId: second?.id } })).toBe(0);
    await viewer.get(ai(`/prompts/${second?.id}`)).expect(404);
  });
});
