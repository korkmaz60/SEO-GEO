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

/** What the fake Labs and Backlinks APIs know about a domain. */
export interface FakeDomain {
  /** Organic keywords by the position of the best result: 1, 2–3, 4–10 and 11–20. */
  positions: [number, number, number, number];
  traffic: number;
  /** Past months, oldest first, ending with the current month. */
  history?: { keywords: number; traffic: number; top10: number }[];
  /** Ranked keywords by traffic: `[keyword, position, traffic, previous position]`. */
  keywords?: [keyword: string, position: number, traffic: number, previous?: number][];
  /** `[domain, common keywords, average position]`; may include the domain itself. */
  competitors?: [domain: string, common: number, avgPosition: number][];
  backlinks?: { rank: number; backlinks: number; referringDomains: number };
  /**
   * Domains linking to this one: `[domain, rank, backlinks]`. They make up the referring
   * domains, one backlink each, and the link gap against other domains.
   */
  referringDomains?: [domain: string, rank: number, backlinks: number][];
  /** Anchor texts: `[anchor, referring domains, backlinks]`. */
  anchors?: [anchor: string, referringDomains: number, backlinks: number][];
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
  /** Domains by host; unknown domains have no data, as with DataForSEO. */
  domains?: Record<string, FakeDomain>;
  /** Paths (without `/v3`) that fail with a server error. */
  failingPaths?: string[];
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
/** Cost DataForSEO reports per Backlinks summary (request and one row). */
export const FAKE_BACKLINKS_COST = 0.024036;
/** What DataForSEO charges for a Backlinks API request returning `rows` rows. */
export function fakeBacklinksCost(rows: number): number {
  return Math.round((0.024 + rows * 0.000036) * 1e6) / 1e6;
}
/** New and lost referring domains and backlinks the fake API reports for every day. */
export const FAKE_DAILY_NEW_LOST = {
  newReferringDomains: 2,
  lostReferringDomains: 1,
  newBacklinks: 5,
  lostBacklinks: 3,
};
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
    datetime: providerTime(60),
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

const EMPTY_POSITIONS = [
  "pos_21_30",
  "pos_31_40",
  "pos_41_50",
  "pos_51_60",
  "pos_61_70",
  "pos_71_80",
  "pos_81_90",
  "pos_91_100",
];

/** `DataforseoLabsMetricsInfo` for keyword counts by position bucket. */
function domainMetrics(positions: readonly number[], traffic: number) {
  const [pos1 = 0, pos2to3 = 0, pos4to10 = 0, pos11to20 = 0] = positions;
  return {
    pos_1: pos1,
    pos_2_3: pos2to3,
    pos_4_10: pos4to10,
    pos_11_20: pos11to20,
    ...Object.fromEntries(EMPTY_POSITIONS.map((key) => [key, 0])),
    etv: traffic,
    impressions_etv: traffic * 12,
    count: pos1 + pos2to3 + pos4to10 + pos11to20,
    estimated_paid_traffic_cost: Math.round(traffic * 25) / 100,
    is_new: 12,
    is_up: 30,
    is_down: 21,
    is_lost: 9,
  };
}

function rankedKeyword(
  target: string,
  [keyword, position, traffic, previous]: NonNullable<FakeDomain["keywords"]>[number],
  metrics: FakeKeywordMetrics | undefined,
) {
  return {
    se_type: "google",
    keyword_data: labsItem(
      keyword,
      metrics ?? { searchVolume: 1000, keywordDifficulty: 20, cpc: 0.1, intent: "informational" },
    ),
    ranked_serp_element: {
      se_type: "google",
      serp_item: {
        se_type: "google",
        type: "organic",
        rank_group: position,
        rank_absolute: position + 1,
        position: "left",
        domain: target,
        url: `https://${target}/${keyword.replaceAll(" ", "-")}`,
        etv: traffic,
        rank_changes: {
          previous_rank_absolute: previous === undefined ? null : previous + 1,
          is_new: previous === undefined,
          is_up: previous !== undefined && previous > position,
          is_down: previous !== undefined && previous < position,
        },
      },
      serp_item_types: ["organic"],
      se_results_count: 1_000_000,
      is_lost: false,
      last_updated_time: providerTime(60 * 24),
      previous_updated_time: providerTime(60 * 24 * 31),
    },
  };
}

function backlinksSummary(target: string, backlinks: FakeDomain["backlinks"]) {
  const domains = backlinks?.referringDomains ?? 0;
  return {
    target,
    first_seen: backlinks ? "2017-03-04 12:31:00 +00:00" : null,
    lost_date: null,
    rank: backlinks?.rank ?? 0,
    backlinks: backlinks?.backlinks ?? 0,
    backlinks_spam_score: backlinks ? 6 : 0,
    crawled_pages: backlinks ? 3120 : 0,
    broken_backlinks: backlinks ? 14 : 0,
    broken_pages: backlinks ? 2 : 0,
    referring_domains: domains,
    referring_domains_nofollow: Math.round(domains / 10),
    referring_main_domains: Math.round(domains * 0.9),
    referring_ips: Math.round(domains * 0.8),
    referring_subnets: Math.round(domains * 0.7),
    referring_pages: Math.round((backlinks?.backlinks ?? 0) * 0.8),
    referring_links_tld: {},
    referring_links_types: {},
    referring_links_attributes: {},
    referring_links_platform_types: {},
    referring_links_semantic_locations: {},
    referring_links_countries: {},
  };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** First days of the months from the month of `from` to the current one, newest first. */
function monthsSince(from: string): string[] {
  const now = new Date();
  const first = `${from.slice(0, 7)}-01`;
  const months: string[] = [];
  for (let offset = 0; offset < 240; offset++) {
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
      .toISOString()
      .slice(0, 10);
    if (month < first) break;
    months.push(month);
  }
  return months;
}

/** Days from `from` to `to` (YYYY-MM-DD), both included, oldest first. */
function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let time = Date.parse(`${from}T00:00:00Z`); time <= end; time += 86_400_000) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/** A month of backlink history; `monthsAgo` months back the site had fewer links. */
function historyItem(
  month: string,
  backlinks: NonNullable<FakeDomain["backlinks"]>,
  monthsAgo: number,
) {
  const domains = backlinks.referringDomains - 5 * monthsAgo;
  return {
    type: "backlinks_history",
    date: `${month} 00:00:00 +00:00`,
    rank: backlinks.rank,
    backlinks: backlinks.backlinks - 100 * monthsAgo,
    new_backlinks: 120,
    lost_backlinks: 80,
    new_referring_domains: 12,
    lost_referring_domains: 7,
    crawled_pages: 3120,
    info: null,
    internal_links_count: 9000,
    external_links_count: 420,
    broken_backlinks: 14,
    broken_pages: 2,
    referring_domains: domains,
    referring_domains_nofollow: Math.round(domains / 10),
    referring_main_domains: Math.round(domains * 0.9),
    referring_main_domains_nofollow: Math.round(domains / 12),
    referring_ips: Math.round(domains * 0.8),
    referring_subnets: Math.round(domains * 0.7),
    referring_pages: Math.round(backlinks.backlinks * 0.8),
    referring_pages_nofollow: 100,
    referring_links_tld: {},
    referring_links_types: {},
    referring_links_attributes: {},
    referring_links_platform_types: {},
    referring_links_semantic_locations: {},
    referring_links_countries: {},
  };
}

function newLostItem(day: string, daily: typeof FAKE_DAILY_NEW_LOST | null) {
  return {
    type: "backlinks_timeseries_new_lost_summary",
    date: `${day} 00:00:00 +00:00`,
    new_backlinks: daily?.newBacklinks ?? 0,
    lost_backlinks: daily?.lostBacklinks ?? 0,
    new_referring_domains: daily?.newReferringDomains ?? 0,
    lost_referring_domains: daily?.lostReferringDomains ?? 0,
    new_referring_main_domains: daily?.newReferringDomains ?? 0,
    lost_referring_main_domains: daily?.lostReferringDomains ?? 0,
  };
}

type FakeReferringDomain = NonNullable<FakeDomain["referringDomains"]>[number];

function referringDomainItem([domain, rank, backlinks]: FakeReferringDomain) {
  return {
    type: "backlinks_referring_domain",
    domain,
    rank,
    backlinks,
    first_seen: "2024-03-01 10:00:00 +00:00",
    lost_date: null,
    backlinks_spam_score: 4,
    broken_backlinks: 0,
    broken_pages: 0,
    referring_domains: 1,
    referring_domains_nofollow: 0,
    referring_main_domains: 1,
    referring_main_domains_nofollow: 0,
    referring_ips: 1,
    referring_subnets: 1,
    referring_pages: backlinks,
    referring_pages_nofollow: 0,
    referring_links_tld: {},
    referring_links_types: { anchor: backlinks },
    referring_links_attributes: null,
    referring_links_platform_types: {},
    referring_links_semantic_locations: {},
    referring_links_countries: {},
  };
}

/** The strongest link of a referring domain (one per domain); weak domains link nofollow. */
function backlinkItem(target: string, [domain, rank, backlinks]: FakeReferringDomain) {
  return {
    type: "backlink",
    domain_from: domain,
    url_from: `https://${domain}/yazi`,
    url_from_https: true,
    domain_to: target,
    url_to: `https://${target}/`,
    url_to_https: true,
    tld_from: domain.split(".").at(-1),
    is_new: false,
    is_lost: false,
    backlink_spam_score: 4,
    rank: Math.round(rank / 2),
    page_from_rank: Math.round(rank * 0.7),
    domain_from_rank: rank,
    domain_from_platform_type: ["blogs"],
    domain_from_is_ip: false,
    domain_from_ip: "192.0.2.80",
    domain_from_country: "TR",
    page_from_external_links: 12,
    page_from_internal_links: 80,
    page_from_size: 64000,
    page_from_encoding: "utf-8",
    page_from_language: "tr",
    page_from_title: `${domain} yazısı`,
    page_from_status_code: 200,
    first_seen: "2024-03-01 10:00:00 +00:00",
    prev_seen: "2026-09-01 10:00:00 +00:00",
    last_seen: providerTime(60 * 24),
    item_type: "anchor",
    attributes: rank >= 30 ? null : ["nofollow"],
    dofollow: rank >= 30,
    original: true,
    alt: null,
    image_url: null,
    anchor: target,
    text_pre: null,
    text_post: null,
    semantic_location: "article",
    links_count: 1,
    group_count: backlinks,
    is_broken: false,
    url_to_status_code: 200,
    url_to_spam_score: 0,
    url_to_redirect_target: null,
    ranked_keywords_info: null,
    is_indirect_link: false,
    indirect_link_path: null,
  };
}

function anchorItem([anchor, domains, backlinks]: NonNullable<FakeDomain["anchors"]>[number]) {
  return {
    type: "backlinks_anchor",
    anchor,
    rank: 20,
    backlinks,
    first_seen: "2023-05-10 08:00:00 +00:00",
    lost_date: null,
    backlinks_spam_score: 3,
    broken_backlinks: 0,
    broken_pages: 0,
    referring_domains: domains,
    referring_domains_nofollow: Math.round(domains / 10),
    referring_main_domains: domains,
    referring_main_domains_nofollow: Math.round(domains / 10),
    referring_ips: domains,
    referring_subnets: domains,
    referring_pages: backlinks,
    referring_pages_nofollow: 0,
    referring_links_tld: {},
    referring_links_types: {},
    referring_links_attributes: null,
    referring_links_platform_types: {},
    referring_links_semantic_locations: {},
    referring_links_countries: {},
  };
}

function intersectionEntry(domain: string, rank: number, backlinks: number) {
  return {
    type: "backlinks_domain_intersection",
    target: domain,
    rank,
    backlinks,
    first_seen: "2025-06-01 12:00:00 +00:00",
    lost_date: null,
    backlinks_spam_score: 2,
    broken_backlinks: 0,
    broken_pages: 0,
    referring_domains: 1,
    referring_domains_nofollow: 0,
    referring_main_domains: 1,
    referring_main_domains_nofollow: 0,
    referring_ips: 1,
    referring_subnets: 1,
    referring_pages: backlinks,
    referring_pages_nofollow: 0,
    referring_links_tld: {},
    referring_links_types: {},
    referring_links_attributes: null,
    referring_links_platform_types: {},
    referring_links_semantic_locations: {},
    referring_links_countries: null,
  };
}

/** A provider timestamp `minutesAgo` before now, formatted like DataForSEO's `datetime`. */
function providerTime(minutesAgo: number): string {
  const iso = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} +00:00`;
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
    datetime: providerTime(5),
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
    datetime: providerTime(1),
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
    datetime: providerTime(3),
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
    if (state.failingPaths?.includes(path)) {
      return Response.json(
        { status_code: 50000, status_message: "Internal Error." },
        { status: 500 },
      );
    }
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

    const domainLabs =
      /^\/dataforseo_labs\/google\/(domain_rank_overview|historical_rank_overview|ranked_keywords|competitors_domain)\/live$/.exec(
        path,
      );
    if (domainLabs) {
      const [request] = body as {
        target: string;
        location_code: number;
        language_code: string;
        limit?: number;
        date_from?: string;
      }[];
      if (!request || request.location_code === UNSUPPORTED_LOCATION) {
        return Response.json(envelope([task("labs", null, 0, {}, 40501)], 0));
      }
      const domain = state.domains?.[request.target];
      const header = {
        se_type: "google",
        target: request.target,
        location_code: request.location_code,
        language_code: request.language_code,
      };
      let items: object[] = [];
      let total = 0;
      if (domain && domainLabs[1] === "domain_rank_overview") {
        items = [
          {
            se_type: "google",
            location_code: request.location_code,
            language_code: request.language_code,
            metrics: {
              organic: domainMetrics(domain.positions, domain.traffic),
              paid: domainMetrics([0, 1, 2, 0], 12.5),
            },
          },
        ];
        total = 1;
      } else if (domain && domainLabs[1] === "historical_rank_overview") {
        const now = new Date();
        const from = request.date_from ?? "0000-00-00";
        items = (domain.history ?? [])
          .map((point, index, all) => {
            const date = new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (all.length - 1 - index), 1),
            );
            const metrics = domainMetrics(
              [0, 0, point.top10, point.keywords - point.top10],
              point.traffic,
            );
            return {
              se_type: "google",
              year: date.getUTCFullYear(),
              month: date.getUTCMonth() + 1,
              metrics: { organic: metrics, paid: null },
            };
          })
          .filter((item) => {
            const month = `${item.year}-${String(item.month).padStart(2, "0")}-01`;
            return month >= from;
          })
          // DataForSEO lists the latest month first.
          .reverse();
        total = items.length;
      } else if (domain && domainLabs[1] === "ranked_keywords") {
        const ranked = domain.keywords ?? [];
        items = ranked
          .slice(0, request.limit ?? 100)
          .map((entry) => rankedKeyword(request.target, entry, state.metrics?.[entry[0]]));
        total = ranked.length;
      } else if (domain && domainLabs[1] === "competitors_domain") {
        const competitors = domain.competitors ?? [];
        items = competitors.slice(0, request.limit ?? 5).map(([name, common, average]) => {
          const known = state.domains?.[name];
          return {
            se_type: "google",
            domain: name,
            avg_position: average,
            sum_position: Math.round(average * common),
            intersections: common,
            full_domain_metrics: known
              ? { organic: domainMetrics(known.positions, known.traffic), paid: null }
              : null,
            metrics: null,
            competitor_metrics: null,
          };
        });
        total = competitors.length;
      }
      const cost = FAKE_LABS_COST + items.length * 0.00012;
      const result = { ...header, total_count: total, items_count: items.length, items };
      return Response.json(envelope([task("labs", [result], cost)], cost));
    }

    if (path === "/backlinks/summary/live") {
      const [request] = body as { target: string }[];
      const domain = state.domains?.[request?.target ?? ""];
      const result = backlinksSummary(request?.target ?? "", domain?.backlinks);
      return Response.json(
        envelope([task("backlinks", [result], FAKE_BACKLINKS_COST)], FAKE_BACKLINKS_COST),
      );
    }

    const backlinksList =
      /^\/backlinks\/(history|timeseries_new_lost_summary|referring_domains|backlinks|anchors)\/live$/.exec(
        path,
      );
    if (backlinksList) {
      const [request] = body as {
        target: string;
        limit?: number;
        date_from?: string;
        date_to?: string;
      }[];
      const target = request?.target ?? "";
      const domain = state.domains?.[target];
      const referring = [...(domain?.referringDomains ?? [])].sort((a, b) => b[1] - a[1]);
      const limit = request?.limit ?? 100;
      let result: Record<string, unknown> = { target };
      let items: object[] = [];
      switch (backlinksList[1]) {
        case "history": {
          const known = domain?.backlinks;
          items = known
            ? monthsSince(request?.date_from ?? "2019-01-01").map((month, index) =>
                historyItem(month, known, index),
              )
            : [];
          result = { ...result, date_from: request?.date_from, date_to: today() };
          break;
        }
        case "timeseries_new_lost_summary": {
          const to = request?.date_to ?? today();
          const daily = domain?.backlinks ? FAKE_DAILY_NEW_LOST : null;
          // Newest first, so the client has to sort.
          items = daysBetween(request?.date_from ?? to, to)
            .map((day) => newLostItem(day, daily))
            .reverse();
          result = { ...result, date_from: request?.date_from, date_to: to, group_range: "day" };
          break;
        }
        case "referring_domains":
          items = referring.slice(0, limit).map((entry) => referringDomainItem(entry));
          result = { ...result, total_count: domain?.backlinks?.referringDomains ?? 0 };
          break;
        case "backlinks":
          items = referring.slice(0, limit).map((entry) => backlinkItem(target, entry));
          result = { ...result, mode: "one_per_domain", total_count: referring.length };
          break;
        case "anchors":
          items = (domain?.anchors ?? []).slice(0, limit).map((entry) => anchorItem(entry));
          result = { ...result, total_count: domain?.anchors?.length ?? 0 };
          break;
      }
      const cost = fakeBacklinksCost(items.length);
      return Response.json(
        envelope(
          [task("backlinks", [{ ...result, items_count: items.length, items }], cost)],
          cost,
        ),
      );
    }

    if (path === "/backlinks/domain_intersection/live") {
      const [request] = body as {
        targets: Record<string, string>;
        exclude_targets?: string[];
        limit?: number;
      }[];
      const targets = Object.entries(request?.targets ?? {})
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, target]) => target);
      const linking = targets.map(
        (target) =>
          new Map((state.domains?.[target]?.referringDomains ?? []).map((row) => [row[0], row])),
      );
      const excluded = new Set(
        (request?.exclude_targets ?? []).flatMap((target) =>
          (state.domains?.[target]?.referringDomains ?? []).map(([name]) => name),
        ),
      );
      // Domains linking to every target, as DataForSEO intersects by default.
      const first = linking[0] ?? new Map();
      const names = [...first.keys()]
        .filter((name) => !excluded.has(name) && linking.every((map) => map.has(name)))
        .sort((a, b) => (first.get(b)?.[1] ?? 0) - (first.get(a)?.[1] ?? 0));
      const items = names.slice(0, request?.limit ?? 100).map((name) => ({
        domain_intersection: Object.fromEntries(
          linking.map((map, index) => {
            const [, rank, links] = map.get(name) ?? [name, 0, 0];
            return [String(index + 1), intersectionEntry(name, rank, links)];
          }),
        ),
        summary: { intersections_count: targets.length },
      }));
      const cost = fakeBacklinksCost(items.length);
      const result = {
        targets: request?.targets ?? {},
        total_count: names.length,
        items_count: items.length,
        items,
      };
      return Response.json(envelope([task("intersection", [result], cost)], cost));
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
