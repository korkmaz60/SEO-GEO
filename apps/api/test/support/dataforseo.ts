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
  featuredSnippet?: string;
}

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
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

interface PostedTask {
  id: string;
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
        .filter((entry) => !entry.collected)
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

    return Response.json({ status_code: 40400, status_message: "Not Found." }, { status: 404 });
  };

  return { fetch: fetch as typeof globalThis.fetch, calls, requests, state, posted };
}
