/** A stand-in for the DataForSEO API that knows one valid login. */
export const GOOD_LOGIN = { login: "api@example.com", password: "good-api-password" };
/** A login whose requests fail at the network level. */
export const UNREACHABLE_LOGIN = { login: "offline@example.com", password: "whatever" };

/** Organic results of a fake SERP: `[domain, path]` pairs in rank order. */
export type FakeOrganic = [domain: string, path: string][];

export interface FakeSerp {
  organic: FakeOrganic;
  /** Domains the AI Overview cites; no AI Overview when omitted. */
  aiOverview?: string[];
  /** The AI Overview's text (Markdown). */
  aiOverviewText?: string;
  featuredSnippet?: string;
}

/** What a fake AI platform answers to a prompt. */
export interface FakeAiAnswer {
  text: string;
  /** Cited URLs, in order. */
  sources?: string[];
}

export type FakeAiPlatform = "chat_gpt" | "gemini" | "claude" | "perplexity" | "ai_mode";
export type FakeModelPlatform = "chat_gpt" | "claude" | "perplexity";

export interface FakeKeywordMetrics {
  searchVolume: number;
  keywordDifficulty: number;
  cpc: number;
  intent: string;
}

export interface FakeDataForSeoState {
  balance: number;
  revoked?: boolean;
  /** SERPs by keyword; unknown keywords return an empty SERP (no results). */
  serps?: Record<string, FakeSerp>;
  /** Labs metrics by keyword; unknown keywords are left out, as DataForSEO does. */
  metrics?: Record<string, FakeKeywordMetrics>;
  /** AI answers by platform and prompt; unknown prompts get no answer (no results). */
  answers?: Partial<Record<FakeAiPlatform, Record<string, FakeAiAnswer>>>;
  /** LLM Responses models by platform; see {@link DEFAULT_FAKE_MODELS}. */
  models?: Partial<Record<FakeModelPlatform, { name: string; webSearch: boolean }[]>>;
  /** Tone the sentiment classifier replies with, by brand name; neutral otherwise. */
  sentiments?: Record<string, "positive" | "neutral" | "negative">;
  /** Platforms whose live answers fail with a server error. */
  failingPlatforms?: FakeAiPlatform[];
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

interface PostedTask {
  id: string;
  kind: "serp" | "llm_scraper:chat_gpt" | "llm_scraper:gemini" | "ai_mode";
  tag: string | null;
  keyword: string;
  locationCode: number;
  languageCode: string;
  depth: number;
  collected: boolean;
}

/** Cost DataForSEO reports per posted SERP task (depth 30, async AI Overview). */
export const FAKE_TASK_COST = 0.0021;
/** Cost DataForSEO reports per Labs request. */
export const FAKE_LABS_COST = 0.0125;
/** A location code the fake Labs API refuses (DataForSEO answers 40501 Invalid Field). */
export const UNSUPPORTED_LOCATION = 1;
/** Cost DataForSEO reports per posted LLM Scraper or AI Mode task. */
export const FAKE_AI_TASK_COST = 0.0012;
/** Cost DataForSEO reports per live LLM Responses answer (task fee and provider tokens). */
export const FAKE_LIVE_COSTS: Record<FakeModelPlatform | "gemini", number> = {
  chat_gpt: 0.0007,
  claude: 0.0214,
  gemini: 0.0106,
  perplexity: 0.0086,
};

export const DEFAULT_FAKE_MODELS: Record<
  FakeModelPlatform,
  { name: string; webSearch: boolean }[]
> = {
  chat_gpt: [
    { name: "gpt-5", webSearch: true },
    { name: "gpt-4.1-mini", webSearch: true },
  ],
  claude: [
    { name: "claude-sonnet-4-5-20250929", webSearch: true },
    { name: "claude-haiku-4-5-20251001", webSearch: true },
    { name: "claude-3-haiku-20240307", webSearch: false },
  ],
  perplexity: [
    { name: "sonar-pro", webSearch: true },
    { name: "sonar", webSearch: true },
  ],
};

function envelope(tasks: object[], cost: number) {
  return {
    version: "0.1.20260901",
    status_code: 20000,
    status_message: "Ok.",
    cost,
    tasks_count: tasks.length,
    tasks_error: 0,
    tasks,
  };
}

function task(id: string, result: unknown[] | null, cost = 0, data: object = {}, status = 20000) {
  return {
    id,
    status_code: status,
    status_message: status === 20000 ? "Ok." : status === 20100 ? "Task Created." : "Error.",
    cost,
    data,
    result,
  };
}

function serpResult(posted: PostedTask, serp: FakeSerp) {
  const items: object[] = [];
  let absolute = 0;
  if (serp.aiOverview) {
    items.push({
      type: "ai_overview",
      rank_group: 1,
      rank_absolute: ++absolute,
      asynchronous_ai_overview: true,
      markdown: serp.aiOverviewText ?? null,
      references: serp.aiOverview.map((domain) => ({
        type: "ai_overview_reference",
        source: domain,
        domain: `www.${domain}`,
        url: `https://www.${domain}/guide`,
        title: `Guide on ${domain}`,
      })),
      items: [],
    });
  }
  if (serp.featuredSnippet) {
    items.push({
      type: "featured_snippet",
      rank_group: 1,
      rank_absolute: ++absolute,
      domain: `www.${serp.featuredSnippet}`,
      url: `https://www.${serp.featuredSnippet}/answer`,
      title: "Answer",
    });
  }
  serp.organic.forEach(([domain, path], index) => {
    items.push({
      type: "organic",
      rank_group: index + 1,
      rank_absolute: ++absolute,
      page: Math.floor(index / 10) + 1,
      domain,
      url: `https://${domain}${path}`,
      title: `${domain} ${path}`,
      description: null,
      breadcrumb: null,
    });
  });
  return {
    keyword: posted.keyword,
    type: "organic",
    se_domain: "google.com.tr",
    location_code: posted.locationCode,
    language_code: posted.languageCode,
    check_url: `https://www.google.com.tr/search?q=${encodeURIComponent(posted.keyword)}`,
    datetime: "2026-09-24 06:12:31 +00:00",
    spell: null,
    item_types: [...new Set(items.map((item) => (item as { type: string }).type))],
    se_results_count: 1_000_000,
    pages_count: 3,
    items_count: items.length,
    items,
  };
}

function labsItem(keyword: string, metrics: FakeKeywordMetrics) {
  return {
    se_type: "google",
    keyword,
    keyword_info: {
      last_updated_time: "2026-09-20 03:41:12 +00:00",
      competition: 0.5,
      competition_level: "MEDIUM",
      cpc: metrics.cpc,
      search_volume: metrics.searchVolume,
      monthly_searches: [{ year: 2026, month: 8, search_volume: metrics.searchVolume }],
      search_volume_trend: { monthly: 0, quarterly: 0, yearly: 0 },
    },
    keyword_properties: {
      keyword_difficulty: metrics.keywordDifficulty,
      words_count: keyword.split(" ").length,
      core_keyword: null,
    },
    search_intent_info: { main_intent: metrics.intent, foreign_intent: null },
    serp_info: null,
  };
}

function hostOf(url: string): string {
  return new URL(url).hostname;
}

function scraperResult(posted: PostedTask, platform: string, answer: FakeAiAnswer) {
  return {
    keyword: posted.keyword,
    location_code: posted.locationCode,
    language_code: posted.languageCode,
    model: platform === "chat_gpt" ? "gpt-5" : "gemini-2.5-flash",
    check_url: `https://chatgpt.com/?q=${encodeURIComponent(posted.keyword)}`,
    datetime: "2026-09-24 10:12:31 +00:00",
    markdown: answer.text,
    search_results: [],
    sources: (answer.sources ?? []).map((url) => ({
      type: "chatgpt_source",
      title: `Page on ${hostOf(url)}`,
      snippet: null,
      domain: hostOf(url),
      url,
      source_name: hostOf(url),
      publication_date: null,
      markdown: null,
    })),
    fan_out_queries: [posted.keyword],
    brand_entities: [],
  };
}

function aiModeResult(posted: PostedTask, answer: FakeAiAnswer) {
  return {
    keyword: posted.keyword,
    type: "ai_mode",
    se_domain: "google.com.tr",
    location_code: posted.locationCode,
    language_code: posted.languageCode,
    check_url: `https://www.google.com.tr/search?q=${encodeURIComponent(posted.keyword)}&udm=50`,
    datetime: "2026-09-24 10:16:10 +00:00",
    item_types: ["ai_overview"],
    items_count: 1,
    items: [
      {
        type: "ai_overview",
        rank_group: 1,
        rank_absolute: 1,
        markdown: answer.text,
        references: (answer.sources ?? []).map((url) => ({
          type: "ai_overview_reference",
          source: hostOf(url),
          domain: hostOf(url),
          url,
          title: `Page on ${hostOf(url)}`,
          text: null,
        })),
      },
    ],
  };
}

function liveResult(model: string, text: string, sources: readonly string[], cost: number) {
  return {
    model_name: model,
    input_tokens: 1200,
    output_tokens: 240,
    reasoning_tokens: 0,
    web_search: sources.length > 0,
    money_spent: Math.max(0, cost - 0.0006),
    datetime: "2026-09-24 10:14:02 +00:00",
    items: [
      {
        type: "message",
        sections: [
          {
            type: "text",
            text,
            annotations: sources.map((url) => ({ title: `Page on ${hostOf(url)}`, url })),
          },
        ],
      },
    ],
    fan_out_queries: null,
  };
}

export function fakeDataForSeo(state: FakeDataForSeoState = { balance: 42.5 }) {
  const calls: string[] = [];
  const requests: RecordedRequest[] = [];
  const posted = new Map<string, PostedTask>();
  let taskCounter = 0;

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    calls.push(String(input));
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined;
    requests.push({ method: init?.method ?? "GET", path: url.pathname, body });

    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const [login, password] = Buffer.from(auth.replace(/^Basic /, ""), "base64")
      .toString("utf8")
      .split(":");
    if (login === UNREACHABLE_LOGIN.login) throw new TypeError("fetch failed");
    if (state.revoked || login !== GOOD_LOGIN.login || password !== GOOD_LOGIN.password) {
      return Response.json(
        { status_code: 40100, status_message: "You are not authorized to access this resource." },
        { status: 401 },
      );
    }

    const path = url.pathname.replace(/^\/v3/, "");
    if (path === "/appendix/user_data") {
      return Response.json(
        envelope(
          [
            task("user", [
              { login: GOOD_LOGIN.login, money: { total: 100, balance: state.balance } },
            ]),
          ],
          0,
        ),
      );
    }

    if (path === "/serp/google/organic/task_post") {
      const tasks = (body as Record<string, unknown>[]).map((entry) => {
        const id = `serp-task-${++taskCounter}`;
        posted.set(id, {
          id,
          kind: "serp",
          tag: typeof entry.tag === "string" ? entry.tag : null,
          keyword: decodeURIComponent(String(entry.keyword)),
          locationCode: Number(entry.location_code),
          languageCode: String(entry.language_code),
          depth: Number(entry.depth ?? 10),
          collected: false,
        });
        return task(id, null, FAKE_TASK_COST, { ...entry, api: "serp" }, 20100);
      });
      return Response.json(envelope(tasks, FAKE_TASK_COST * tasks.length));
    }

    if (path === "/serp/google/organic/tasks_ready") {
      const ready = [...posted.values()]
        .filter((entry) => entry.kind === "serp" && !entry.collected)
        .map((entry) => ({
          id: entry.id,
          se: "google",
          se_type: "organic",
          date_posted: "2026-09-24 06:10:02 +00:00",
          tag: entry.tag,
        }));
      return Response.json(envelope([task("ready", ready)], 0));
    }

    const taskGet = /^\/serp\/google\/organic\/task_get\/advanced\/(.+)$/.exec(path);
    if (taskGet) {
      const entry = posted.get(decodeURIComponent(taskGet[1] as string));
      if (!entry) {
        return Response.json(envelope([task("missing", null, 0, {}, 40401)], 0));
      }
      entry.collected = true;
      const serp = state.serps?.[entry.keyword];
      const data = { tag: entry.tag, keyword: entry.keyword };
      if (!serp) return Response.json(envelope([task(entry.id, null, 0, data, 40102)], 0));
      return Response.json(envelope([task(entry.id, [serpResult(entry, serp)], 0, data)], 0));
    }

    if (path === "/dataforseo_labs/google/keyword_overview/live") {
      const [request] = body as { keywords: string[] }[];
      const items = (request?.keywords ?? []).flatMap((keyword) => {
        const metrics = state.metrics?.[keyword];
        return metrics ? [labsItem(keyword, metrics)] : [];
      });
      return Response.json(
        envelope(
          [task("overview", [{ items_count: items.length, items }], FAKE_LABS_COST)],
          FAKE_LABS_COST,
        ),
      );
    }

    const labs =
      /^\/dataforseo_labs\/google\/(keyword_suggestions|keyword_ideas|related_keywords)\/live$/.exec(
        path,
      );
    if (labs) {
      const [request] = body as {
        keyword?: string;
        keywords?: string[];
        location_code: number;
        limit?: number;
      }[];
      if (request?.location_code === UNSUPPORTED_LOCATION) {
        return Response.json(envelope([task("labs", null, 0, {}, 40501)], 0));
      }
      const seed = request?.keyword ?? request?.keywords?.[0] ?? "";
      const known = Object.entries(state.metrics ?? {});
      const matches = known
        .filter(([keyword]) => keyword !== seed)
        .filter(([keyword]) => labs[1] !== "keyword_suggestions" || keyword.includes(seed))
        .slice(0, request?.limit ?? 100);
      const seedMetrics = state.metrics?.[seed];
      const items =
        labs[1] === "related_keywords"
          ? matches.map(([keyword, metrics]) => ({
              keyword_data: labsItem(keyword, metrics),
              depth: 1,
              related_keywords: [],
            }))
          : matches.map(([keyword, metrics]) => labsItem(keyword, metrics));
      const result = {
        seed_keyword: seed,
        seed_keyword_data:
          labs[1] !== "keyword_ideas" && seedMetrics ? labsItem(seed, seedMetrics) : null,
        total_count: matches.length,
        items_count: items.length,
        items,
      };
      const cost = FAKE_LABS_COST + items.length * 0.00012;
      return Response.json(envelope([task("labs", [result], cost)], cost));
    }

    const aiPost =
      /^\/ai_optimization\/(chat_gpt|gemini)\/llm_scraper\/task_post$/.exec(path) ??
      /^\/serp\/google\/(ai_mode)\/task_post$/.exec(path);
    if (aiPost) {
      const kind = (aiPost[1] === "ai_mode" ? "ai_mode" : `llm_scraper:${aiPost[1]}`) as
        "ai_mode" | "llm_scraper:chat_gpt" | "llm_scraper:gemini";
      const tasks = (body as Record<string, unknown>[]).map((entry) => {
        const id = `${aiPost[1]}-task-${++taskCounter}`;
        posted.set(id, {
          id,
          kind,
          tag: typeof entry.tag === "string" ? entry.tag : null,
          keyword: decodeURIComponent(String(entry.keyword)),
          locationCode: Number(entry.location_code),
          languageCode: String(entry.language_code),
          depth: 0,
          collected: false,
        });
        return task(id, null, FAKE_AI_TASK_COST, entry, 20100);
      });
      return Response.json(envelope(tasks, FAKE_AI_TASK_COST * tasks.length));
    }

    const aiReady =
      /^\/ai_optimization\/(chat_gpt|gemini)\/llm_scraper\/tasks_ready$/.exec(path) ??
      /^\/serp\/google\/(ai_mode)\/tasks_ready$/.exec(path);
    if (aiReady) {
      const kind = aiReady[1] === "ai_mode" ? "ai_mode" : `llm_scraper:${aiReady[1]}`;
      const ready = [...posted.values()]
        .filter((entry) => entry.kind === kind && !entry.collected)
        .map((entry) => ({
          id: entry.id,
          date_posted: "2026-09-24 10:10:02 +00:00",
          tag: entry.tag,
        }));
      return Response.json(envelope([task("ready", ready)], 0));
    }

    const aiGet =
      /^\/ai_optimization\/(chat_gpt|gemini)\/llm_scraper\/task_get\/advanced\/(.+)$/.exec(path) ??
      /^\/serp\/google\/(ai_mode)\/task_get\/advanced\/(.+)$/.exec(path);
    if (aiGet) {
      const platform = aiGet[1] as "chat_gpt" | "gemini" | "ai_mode";
      const entry = posted.get(decodeURIComponent(aiGet[2] as string));
      if (!entry) return Response.json(envelope([task("missing", null, 0, {}, 40401)], 0));
      entry.collected = true;
      const answer = state.answers?.[platform]?.[entry.keyword];
      const data = { tag: entry.tag, keyword: entry.keyword };
      if (!answer) return Response.json(envelope([task(entry.id, null, 0, data, 40102)], 0));
      const result =
        platform === "ai_mode"
          ? aiModeResult(entry, answer)
          : scraperResult(entry, platform, answer);
      return Response.json(envelope([task(entry.id, [result], 0, data)], 0));
    }

    const live =
      /^\/ai_optimization\/(chat_gpt|claude|gemini|perplexity)\/llm_responses\/live$/.exec(path);
    if (live) {
      const platform = live[1] as FakeModelPlatform | "gemini";
      const [request] = body as { user_prompt: string; model_name: string; tag?: string }[];
      const data = { ...request };
      if (state.failingPlatforms?.includes(platform)) {
        return Response.json(
          { status_code: 50000, status_message: "Internal Error." },
          { status: 500 },
        );
      }
      const cost = FAKE_LIVE_COSTS[platform];
      if (platform === "chat_gpt") {
        // Only used to classify sentiment in these tests.
        const brand = /toward "([^"]+)"/.exec(request?.user_prompt ?? "")?.[1] ?? "";
        const sentiment = state.sentiments?.[brand] ?? "neutral";
        const reply = `{"sentiment":"${sentiment}","confidence":0.8}`;
        const result = liveResult(request?.model_name ?? "", reply, [], cost);
        return Response.json(envelope([task("live", [result], cost, data)], cost));
      }
      const answer = state.answers?.[platform]?.[request?.user_prompt ?? ""];
      if (!answer) return Response.json(envelope([task("live", null, 0, data, 40102)], 0));
      const result = liveResult(request?.model_name ?? "", answer.text, answer.sources ?? [], cost);
      return Response.json(envelope([task("live", [result], cost, data)], cost));
    }

    const models = /^\/ai_optimization\/(chat_gpt|claude|perplexity)\/llm_responses\/models$/.exec(
      path,
    );
    if (models) {
      const platform = models[1] as FakeModelPlatform;
      const list = (state.models?.[platform] ?? DEFAULT_FAKE_MODELS[platform]).map((model) => ({
        model_name: model.name,
        web_search_supported: model.webSearch,
        task_post_supported: platform !== "perplexity",
      }));
      return Response.json(envelope([task("models", list)], 0));
    }

    return Response.json({ status_code: 40400, status_message: "Not Found." }, { status: 404 });
  };

  return { fetch: fetch as typeof globalThis.fetch, calls, requests, state, posted };
}
