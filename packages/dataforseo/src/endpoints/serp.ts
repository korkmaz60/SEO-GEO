import { z } from "zod";

import type { DataForSeoClient } from "../client.js";
import { STATUS_NO_SEARCH_RESULTS, STATUS_TASK_HANDED, STATUS_TASK_IN_QUEUE } from "../envelope.js";
import {
  MAX_TASKS_PER_POST,
  compact,
  firstTask,
  getReadyTaskList,
  hostOf,
  parseResponse,
  postTaskBatch,
  tagOf,
  toIsoDateTime,
  type PostedTask,
  type ReadyTask,
} from "./shared.js";

export { MAX_TASKS_PER_POST, type PostedTask, type ReadyTask } from "./shared.js";

// SERP API, Google organic. Field names follow the official DataForSEO client
// (dataforseo-client 2.x: SerpGoogleOrganicTaskPostRequestInfo, …TaskGetAdvancedResultInfo,
// OrganicSerpElementItem, AiOverviewSerpElementItem, AiModeAiOverviewReferenceInfo).

const BASE = "/serp/google/organic";
export const GOOGLE_ORGANIC_TASK_POST_PATH = `${BASE}/task_post`;
export const GOOGLE_ORGANIC_TASKS_READY_PATH = `${BASE}/tasks_ready`;
export const GOOGLE_ORGANIC_LIVE_ADVANCED_PATH = `${BASE}/live/advanced`;
export const googleOrganicTaskGetAdvancedPath = (id: string) =>
  `${BASE}/task_get/advanced/${encodeURIComponent(id)}`;

/** Deepest Google organic SERP DataForSEO returns. */
export const MAX_SERP_DEPTH = 700;
const MAX_KEYWORD_LENGTH = 700;
const MAX_TAG_LENGTH = 255;

export type SerpDevice = "desktop" | "mobile";

export interface GoogleOrganicTaskInput {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device?: SerpDevice;
  /** Number of results; every page of 10 is billed. Defaults to 10. */
  depth?: number;
  /** Also collect AI Overviews that load asynchronously (extra cost, refunded when absent). */
  loadAsyncAiOverview?: boolean;
  /** Returned with the results; identifies the task on our side (max 255 characters). */
  tag?: string;
  /** Standard queue only: `high` costs more and is processed first. */
  priority?: "normal" | "high";
  /** Standard queue only: DataForSEO calls this URL (GET) when the task is done. */
  pingbackUrl?: string;
}

/**
 * DataForSEO decodes `%XX` sequences and turns `+` into a space in `keyword`, so both are
 * escaped to reach the search engine literally ("c++" stays "c++").
 */
export function encodeSerpKeyword(keyword: string): string {
  return keyword.replaceAll("%", "%25").replaceAll("+", "%2B");
}

function toRequestBody(input: GoogleOrganicTaskInput, mode: "task" | "live") {
  const keyword = input.keyword.trim();
  if (keyword.length === 0 || keyword.length > MAX_KEYWORD_LENGTH) {
    throw new RangeError(`keyword must be 1–${MAX_KEYWORD_LENGTH} characters`);
  }
  if (
    input.depth !== undefined &&
    (!Number.isInteger(input.depth) || input.depth < 1 || input.depth > MAX_SERP_DEPTH)
  ) {
    throw new RangeError(`depth must be an integer between 1 and ${MAX_SERP_DEPTH}`);
  }
  if (input.tag !== undefined && input.tag.length > MAX_TAG_LENGTH) {
    throw new RangeError(`tag must be at most ${MAX_TAG_LENGTH} characters`);
  }
  return compact({
    keyword: encodeSerpKeyword(keyword),
    location_code: input.locationCode,
    language_code: input.languageCode,
    device: input.device,
    depth: input.depth,
    load_async_ai_overview: input.loadAsyncAiOverview,
    tag: input.tag,
    priority: mode === "task" && input.priority ? (input.priority === "high" ? 2 : 1) : undefined,
    pingback_url: mode === "task" ? input.pingbackUrl : undefined,
  });
}

// ── Response schemas ────────────────────────────────────────────────────────────────

/**
 * Fields that only some element types carry, or carry in other shapes, are read leniently:
 * a missing key stays `undefined` and a value of another type becomes `null`.
 */
const text = z.string().nullish().catch(null);
const count = z.number().nullish().catch(null);

const SerpItemSchema = z.looseObject({ type: z.string() });

const OrganicItemSchema = z.looseObject({
  type: z.literal("organic"),
  rank_group: z.number(),
  rank_absolute: z.number(),
  page: count,
  domain: text,
  url: text,
  title: text,
  description: text,
  breadcrumb: text,
});

const AiOverviewReferenceSchema = z.looseObject({
  source: text,
  domain: text,
  url: text,
  title: text,
});

const AiOverviewItemSchema = z.looseObject({
  type: z.literal("ai_overview"),
  rank_group: count,
  rank_absolute: count,
  asynchronous_ai_overview: z.boolean().nullish(),
  markdown: text,
  references: z.array(AiOverviewReferenceSchema).nullish(),
  items: z
    .array(z.looseObject({ references: z.array(AiOverviewReferenceSchema).nullish() }))
    .nullish(),
});

const SerpResultSchema = z.looseObject({
  keyword: z.string(),
  location_code: count,
  language_code: text,
  se_domain: text,
  check_url: text,
  datetime: text,
  spell: z.looseObject({ keyword: z.string(), type: z.string() }).nullish(),
  item_types: z.array(z.string()).nullish(),
  se_results_count: count,
  pages_count: count,
  items: z.array(SerpItemSchema).nullish(),
});

// ── Normalized results ──────────────────────────────────────────────────────────────

export interface SerpLink {
  domain: string | null;
  url: string | null;
}

export interface SerpOrganicResult extends SerpLink {
  /** Position among organic results (1 = first organic result). */
  rankGroup: number;
  /** Position among all SERP elements. */
  rankAbsolute: number;
  page: number | null;
  title: string | null;
  description: string | null;
  breadcrumb: string | null;
}

/** Any element other than an organic result, e.g. `featured_snippet`, `local_pack`, `video`. */
export interface SerpFeature {
  type: string;
  rankGroup: number | null;
  rankAbsolute: number | null;
  /** Every link in the element and its sub-elements. */
  links: SerpLink[];
}

export interface SerpAiOverviewReference extends SerpLink {
  title: string | null;
  source: string | null;
}

export interface SerpAiOverview {
  rankAbsolute: number | null;
  /** `true` when the overview loads asynchronously (collected with `loadAsyncAiOverview`). */
  asynchronous: boolean | null;
  /** The overview's text in Markdown, when DataForSEO returns it. */
  markdown: string | null;
  /** Pages the overview cites, deduplicated by URL. */
  references: SerpAiOverviewReference[];
}

export interface GoogleOrganicSerp {
  keyword: string;
  locationCode: number | null;
  languageCode: string | null;
  seDomain: string | null;
  checkUrl: string | null;
  /** When DataForSEO fetched the SERP (ISO 8601). */
  fetchedAt: string | null;
  /** Set when Google corrected the query ("did you mean", "showing results for"). */
  spell: { keyword: string; type: string } | null;
  /** Element types present in the SERP. */
  itemTypes: string[];
  resultsCount: number | null;
  pagesCount: number | null;
  organic: SerpOrganicResult[];
  features: SerpFeature[];
  aiOverview: SerpAiOverview | null;
}

/** How deep {@link collectLinks} descends into nested SERP elements. */
const MAX_LINK_DEPTH = 5;

/**
 * Collects the `url` and `domain` pairs of an element and its sub-elements (e.g. the pages in
 * a video carousel or the answers of "People also ask"). Image and pixel data are skipped.
 */
function collectLinks(value: unknown, links: Map<string, SerpLink>, depth = 0): void {
  if (depth > MAX_LINK_DEPTH || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectLinks(entry, links, depth + 1);
    return;
  }
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url : null;
  const domain = typeof record.domain === "string" ? record.domain : null;
  if (url || domain) {
    const key = url ?? `domain:${domain}`;
    if (!links.has(key)) links.set(key, { domain: domain ?? hostOf(url), url });
  }
  for (const [key, child] of Object.entries(record)) {
    if (key === "rectangle" || key === "images") continue;
    if (child !== null && typeof child === "object") collectLinks(child, links, depth + 1);
  }
}

/** Converts a Google organic "advanced" result into {@link GoogleOrganicSerp}. */
export function parseGoogleOrganicSerp(
  result: unknown,
  path = GOOGLE_ORGANIC_LIVE_ADVANCED_PATH,
): GoogleOrganicSerp {
  const serp = parseResponse(SerpResultSchema, result, path);
  const organic: SerpOrganicResult[] = [];
  const features: SerpFeature[] = [];
  let aiOverview: SerpAiOverview | null = null;

  for (const item of serp.items ?? []) {
    if (item.type === "organic") {
      const entry = parseResponse(OrganicItemSchema, item, path);
      const url = entry.url ?? null;
      organic.push({
        rankGroup: entry.rank_group,
        rankAbsolute: entry.rank_absolute,
        page: entry.page ?? null,
        domain: entry.domain ?? hostOf(url),
        url,
        title: entry.title ?? null,
        description: entry.description ?? null,
        breadcrumb: entry.breadcrumb ?? null,
      });
      continue;
    }

    const links = new Map<string, SerpLink>();
    collectLinks(item, links);
    const rank = parseResponse(
      z.looseObject({ rank_group: count, rank_absolute: count }),
      item,
      path,
    );
    features.push({
      type: item.type,
      rankGroup: rank.rank_group ?? null,
      rankAbsolute: rank.rank_absolute ?? null,
      links: [...links.values()],
    });

    if (item.type === "ai_overview" && aiOverview === null) {
      const overview = parseResponse(AiOverviewItemSchema, item, path);
      const references = new Map<string, SerpAiOverviewReference>();
      const nested = (overview.items ?? []).flatMap((element) => element.references ?? []);
      for (const reference of [...(overview.references ?? []), ...nested]) {
        const url = reference.url ?? null;
        const key = url ?? `${reference.domain}|${reference.title}`;
        if (references.has(key)) continue;
        references.set(key, {
          domain: reference.domain ?? hostOf(url),
          url,
          title: reference.title ?? null,
          source: reference.source ?? null,
        });
      }
      aiOverview = {
        rankAbsolute: overview.rank_absolute ?? null,
        asynchronous: overview.asynchronous_ai_overview ?? null,
        markdown: overview.markdown ?? null,
        references: [...references.values()],
      };
    }
  }

  organic.sort((a, b) => a.rankGroup - b.rankGroup);
  return {
    keyword: serp.keyword,
    locationCode: serp.location_code ?? null,
    languageCode: serp.language_code ?? null,
    seDomain: serp.se_domain ?? null,
    checkUrl: serp.check_url ?? null,
    fetchedAt: toIsoDateTime(serp.datetime),
    spell: serp.spell ? { keyword: serp.spell.keyword, type: serp.spell.type } : null,
    itemTypes: [...new Set(serp.item_types ?? [])],
    resultsCount: serp.se_results_count ?? null,
    pagesCount: serp.pages_count ?? null,
    organic,
    features,
    aiOverview,
  };
}

// ── Endpoints ───────────────────────────────────────────────────────────────────────

/**
 * Queues SERP tasks (Standard queue). Results are collected later with
 * {@link getReadyGoogleOrganicTasks} and {@link getGoogleOrganicTaskAdvanced}. DataForSEO
 * bills at posting time, so the returned cost is final.
 *
 * Takes at most {@link MAX_TASKS_PER_POST} tasks; callers post larger batches in chunks and
 * record each chunk before sending the next.
 */
export async function postGoogleOrganicTasks(
  client: DataForSeoClient,
  inputs: readonly GoogleOrganicTaskInput[],
): Promise<{ cost: number; tasks: PostedTask[] }> {
  if (inputs.length > MAX_TASKS_PER_POST) {
    throw new RangeError(`At most ${MAX_TASKS_PER_POST} tasks can be posted at once`);
  }
  return postTaskBatch(
    client,
    GOOGLE_ORGANIC_TASK_POST_PATH,
    inputs.map((input) => toRequestBody(input, "task")),
  );
}

/** Completed Standard-queue organic SERP tasks not collected yet; see {@link getReadyTaskList}. */
export function getReadyGoogleOrganicTasks(
  client: DataForSeoClient,
): Promise<{ cost: number; tasks: ReadyTask[] }> {
  return getReadyTaskList(client, GOOGLE_ORGANIC_TASKS_READY_PATH);
}

export type GoogleOrganicTaskResult =
  | { status: "ready"; id: string; tag: string | null; serp: GoogleOrganicSerp; cost: number }
  /** Google answered with no results for the query. */
  | { status: "no_results"; id: string; tag: string | null; cost: number }
  /** Still queued or being processed. */
  | { status: "pending"; id: string };

/** Result of a Standard-queue task. Free; results stay available for 30 days. */
export async function getGoogleOrganicTaskAdvanced(
  client: DataForSeoClient,
  id: string,
): Promise<GoogleOrganicTaskResult> {
  const path = googleOrganicTaskGetAdvancedPath(id);
  const task = firstTask(await client.get<unknown>(path), path);
  const tag = tagOf(task);
  if (!task.ok) {
    if (task.statusCode === STATUS_TASK_IN_QUEUE || task.statusCode === STATUS_TASK_HANDED) {
      return { status: "pending", id };
    }
    if (task.statusCode === STATUS_NO_SEARCH_RESULTS) {
      return { status: "no_results", id: task.id, tag, cost: task.cost };
    }
    throw task.error;
  }
  const first = task.result[0];
  if (first === undefined || first === null) {
    return { status: "no_results", id: task.id, tag, cost: task.cost };
  }
  return {
    status: "ready",
    id: task.id,
    tag,
    serp: parseGoogleOrganicSerp(first, path),
    cost: task.cost,
  };
}

/** A SERP fetched in the same request (Live mode, the most expensive). */
export async function getGoogleOrganicLiveAdvanced(
  client: DataForSeoClient,
  input: Omit<GoogleOrganicTaskInput, "priority" | "pingbackUrl">,
): Promise<{ serp: GoogleOrganicSerp | null; cost: number }> {
  const path = GOOGLE_ORGANIC_LIVE_ADVANCED_PATH;
  const response = await client.post<unknown>(path, [toRequestBody(input, "live")]);
  const task = firstTask(response, path);
  if (!task.ok) {
    if (task.statusCode === STATUS_NO_SEARCH_RESULTS) return { serp: null, cost: response.cost };
    throw task.error;
  }
  const first = task.result[0];
  return {
    serp: first === undefined || first === null ? null : parseGoogleOrganicSerp(first, path),
    cost: response.cost,
  };
}
