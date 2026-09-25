import { z } from "zod";

import type { DataForSeoClient } from "../client.js";
import { STATUS_NO_SEARCH_RESULTS, STATUS_TASK_HANDED, STATUS_TASK_IN_QUEUE } from "../envelope.js";
import { encodeSerpKeyword, type SerpDevice } from "./serp.js";
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

// AI Optimization API (LLM Scraper, LLM Responses) and SERP API Google AI Mode. Field names
// follow the official DataForSEO client (dataforseo-client 2.1.7):
// AiOptimizationChatGptLlmScraperTaskPostRequestInfo, …LlmScraperTaskGetAdvancedResultInfo,
// SourceInfo, ChatgptSearchResult, ChatGptBrandEntity,
// AiOptimizationClaudeLlmResponsesTaskPostRequestInfo, …LlmResponsesTaskGetResultInfo,
// MessageAiOptimizationLlmResponseElementItem, LlmMessageSectionInfo, AnnotationInfo,
// …LlmResponsesModelsResultInfo, SerpGoogleAiModeTaskPostRequestInfo, AiModeAiOverviewInfo,
// AiModeAiOverviewReferenceInfo.

/** Platforms whose consumer interface the LLM Scraper reads (answers as users see them). */
export type LlmScraperPlatform = "chat_gpt" | "gemini";
/** Platforms reached through their model APIs (LLM Responses). */
export type LlmResponsesPlatform = "chat_gpt" | "claude" | "gemini" | "perplexity";

/** The LLM Scraper takes prompts up to this length. */
export const MAX_SCRAPER_PROMPT_LENGTH = 2000;
/** LLM Responses take prompts (`user_prompt`) up to this length. */
export const MAX_LLM_PROMPT_LENGTH = 500;
/** Google AI Mode takes queries up to this length. */
export const MAX_AI_MODE_QUERY_LENGTH = 700;
const MAX_TAG_LENGTH = 255;

const scraperBase = (platform: LlmScraperPlatform) => `/ai_optimization/${platform}/llm_scraper`;
const responsesBase = (platform: LlmResponsesPlatform) =>
  `/ai_optimization/${platform}/llm_responses`;
const AI_MODE_BASE = "/serp/google/ai_mode";

export const llmScraperTaskPostPath = (platform: LlmScraperPlatform) =>
  `${scraperBase(platform)}/task_post`;
export const llmScraperTasksReadyPath = (platform: LlmScraperPlatform) =>
  `${scraperBase(platform)}/tasks_ready`;
export const llmScraperTaskGetPath = (platform: LlmScraperPlatform, id: string) =>
  `${scraperBase(platform)}/task_get/advanced/${encodeURIComponent(id)}`;
export const llmResponsesTaskPostPath = (platform: LlmResponsesPlatform) =>
  `${responsesBase(platform)}/task_post`;
export const llmResponsesTasksReadyPath = (platform: LlmResponsesPlatform) =>
  `${responsesBase(platform)}/tasks_ready`;
export const llmResponsesTaskGetPath = (platform: LlmResponsesPlatform, id: string) =>
  `${responsesBase(platform)}/task_get/${encodeURIComponent(id)}`;
export const llmResponsesLivePath = (platform: LlmResponsesPlatform) =>
  `${responsesBase(platform)}/live`;
export const llmResponsesModelsPath = (platform: LlmResponsesPlatform) =>
  `${responsesBase(platform)}/models`;
export const AI_MODE_TASK_POST_PATH = `${AI_MODE_BASE}/task_post`;
export const AI_MODE_TASKS_READY_PATH = `${AI_MODE_BASE}/tasks_ready`;
export const aiModeTaskGetPath = (id: string) =>
  `${AI_MODE_BASE}/task_get/advanced/${encodeURIComponent(id)}`;

// ── Normalized answers ──────────────────────────────────────────────────────────────

export interface AiSource {
  /** Order in which the answer lists the source; 1 = first. */
  rank: number;
  url: string | null;
  domain: string | null;
  title: string | null;
}

export interface AiBrandEntity {
  name: string;
  category: string | null;
  urls: string[];
}

export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  /** What the model provider charged for the tokens (included in the task cost). */
  providerCostUsd: number | null;
}

/** An AI answer in one shape, whatever the platform and retrieval method. */
export interface AiAnswer {
  /** The answer as text; Markdown when the platform returns Markdown. */
  text: string;
  /** Model or model version reported by the platform. */
  model: string | null;
  /** Sources the answer cites, in order, one per URL. */
  sources: AiSource[];
  /** Web results the model looked at, cited or not (ChatGPT interface only). */
  searchResults: AiSource[];
  /** Brands the platform marked in its answer (ChatGPT interface only). */
  brandEntities: AiBrandEntity[];
  /** Searches the model ran to answer the prompt. */
  fanOutQueries: string[];
  /** Whether the model searched the web; `null` when not reported. */
  webSearch: boolean | null;
  checkUrl: string | null;
  /** When DataForSEO received the answer (ISO 8601). */
  fetchedAt: string | null;
  /** Token counts, for LLM Responses only. */
  usage: AiUsage | null;
}

export type AiTaskResult =
  | { status: "ready"; id: string; tag: string | null; answer: AiAnswer; cost: number }
  /** The platform returned no answer for the prompt. */
  | { status: "no_results"; id: string; tag: string | null; cost: number }
  /** Still queued or being processed. */
  | { status: "pending"; id: string };

// ── Response schemas (lenient: optional fields become `null` when missing or odd) ─────

const text = z.string().nullish().catch(null);
const count = z.number().nullish().catch(null);
const strings = z
  .array(z.unknown())
  .nullish()
  .catch(null)
  .transform((values) =>
    (values ?? []).filter((value): value is string => typeof value === "string"),
  );

const SourceSchema = z.looseObject({
  title: text,
  domain: text,
  url: text,
  source_name: text,
});

const BrandEntitySchema = z.looseObject({
  title: text,
  category: text,
  urls: z.unknown().optional(),
});

const LlmScraperResultSchema = z.looseObject({
  keyword: text,
  model: text,
  check_url: text,
  datetime: text,
  markdown: text,
  search_results: z.array(SourceSchema).nullish().catch(null),
  sources: z.array(SourceSchema).nullish().catch(null),
  fan_out_queries: strings,
  brand_entities: z.array(BrandEntitySchema).nullish().catch(null),
  items: z
    .array(z.looseObject({ type: text, markdown: text, text: text }))
    .nullish()
    .catch(null),
});

const AnnotationSchema = z.looseObject({
  title: text,
  url: text,
  direct_url: text,
});

const MessageItemSchema = z.looseObject({
  type: text,
  sections: z
    .array(
      z.looseObject({
        type: text,
        text: text,
        annotations: z.array(AnnotationSchema).nullish().catch(null),
      }),
    )
    .nullish()
    .catch(null),
});

const LlmResponsesResultSchema = z.looseObject({
  model_name: text,
  input_tokens: count,
  output_tokens: count,
  reasoning_tokens: count,
  web_search: z.boolean().nullish().catch(null),
  money_spent: count,
  datetime: text,
  items: z.array(MessageItemSchema).nullish().catch(null),
  fan_out_queries: strings,
});

const AiModeReferenceSchema = z.looseObject({
  source: text,
  domain: text,
  url: text,
  title: text,
});

const AiModeResultSchema = z.looseObject({
  keyword: text,
  check_url: text,
  datetime: text,
  items: z
    .array(
      z.looseObject({
        type: text,
        markdown: text,
        references: z.array(AiModeReferenceSchema).nullish().catch(null),
        items: z
          .array(
            z.looseObject({ references: z.array(AiModeReferenceSchema).nullish().catch(null) }),
          )
          .nullish()
          .catch(null),
      }),
    )
    .nullish()
    .catch(null),
});

const ModelSchema = z.looseObject({
  model_name: z.string(),
  web_search_supported: z.boolean().nullish().catch(null),
  task_post_supported: z.boolean().nullish().catch(null),
});

// ── Parsing ─────────────────────────────────────────────────────────────────────────

/** Sources in order, one per URL (or per domain and title when there is no URL). */
function rankSources(
  entries: readonly { url: string | null; domain: string | null; title: string | null }[],
): AiSource[] {
  const seen = new Map<string, AiSource>();
  for (const entry of entries) {
    const url = entry.url?.trim() || null;
    const domain = entry.domain?.trim() || hostOf(url);
    if (!url && !domain) continue;
    const key = url ?? `${domain}|${entry.title ?? ""}`;
    if (seen.has(key)) continue;
    seen.set(key, { rank: seen.size + 1, url, domain, title: entry.title?.trim() || null });
  }
  return [...seen.values()];
}

function brandUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const urls: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") urls.push(entry);
    else if (entry && typeof entry === "object") {
      const record = entry as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url : record.domain;
      if (typeof url === "string") urls.push(url);
    }
  }
  return [...new Set(urls)];
}

/** An LLM Scraper "advanced" result (ChatGPT or Gemini as shown to users). */
export function parseLlmScraperAnswer(result: unknown, path: string): AiAnswer | null {
  const answer = parseResponse(LlmScraperResultSchema, result, path);
  const body =
    answer.markdown?.trim() ||
    (answer.items ?? [])
      .map((item) => item.markdown?.trim() || item.text?.trim() || "")
      .filter(Boolean)
      .join("\n\n");
  if (!body) return null;
  const toSource = (entry: z.infer<typeof SourceSchema>) => ({
    url: entry.url ?? null,
    domain: entry.domain ?? null,
    title: entry.title ?? entry.source_name ?? null,
  });
  return {
    text: body,
    model: answer.model ?? null,
    sources: rankSources((answer.sources ?? []).map(toSource)),
    searchResults: rankSources((answer.search_results ?? []).map(toSource)),
    brandEntities: (answer.brand_entities ?? [])
      .filter((entity) => entity.title?.trim())
      .map((entity) => ({
        name: entity.title!.trim(),
        category: entity.category ?? null,
        urls: brandUrls(entity.urls),
      })),
    fanOutQueries: answer.fan_out_queries,
    // The interface does not say whether it searched; sources show that it did.
    webSearch:
      (answer.sources ?? []).length > 0 || (answer.search_results ?? []).length > 0 ? true : null,
    checkUrl: answer.check_url ?? null,
    fetchedAt: toIsoDateTime(answer.datetime),
    usage: null,
  };
}

/** An LLM Responses result (the platform's model API). Reasoning items are left out. */
export function parseLlmResponsesAnswer(result: unknown, path: string): AiAnswer | null {
  const answer = parseResponse(LlmResponsesResultSchema, result, path);
  const sections = (answer.items ?? [])
    .filter((item) => item.type !== "reasoning")
    .flatMap((item) => item.sections ?? []);
  const body = sections
    .map((section) => section.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
  if (!body) return null;
  const annotations = sections.flatMap((section) => section.annotations ?? []);
  return {
    text: body,
    model: answer.model_name ?? null,
    // Gemini's `url` is a redirect; `direct_url` is the page itself.
    sources: rankSources(
      annotations.map((annotation) => {
        const url = annotation.direct_url ?? annotation.url ?? null;
        return { url, domain: null, title: annotation.title ?? null };
      }),
    ),
    searchResults: [],
    brandEntities: [],
    fanOutQueries: answer.fan_out_queries,
    webSearch: answer.web_search ?? null,
    checkUrl: null,
    fetchedAt: toIsoDateTime(answer.datetime),
    usage: {
      inputTokens: answer.input_tokens ?? null,
      outputTokens: answer.output_tokens ?? null,
      reasoningTokens: answer.reasoning_tokens ?? null,
      providerCostUsd: answer.money_spent ?? null,
    },
  };
}

/** A Google AI Mode "advanced" result: the answer and the pages it references. */
export function parseAiModeAnswer(result: unknown, path: string): AiAnswer | null {
  const serp = parseResponse(AiModeResultSchema, result, path);
  const overview = (serp.items ?? []).find((item) => item.type === "ai_overview");
  const body = overview?.markdown?.trim();
  if (!overview || !body) return null;
  const references = [
    ...(overview.references ?? []),
    ...(overview.items ?? []).flatMap((item) => item.references ?? []),
  ];
  return {
    text: body,
    model: null,
    sources: rankSources(
      references.map((reference) => ({
        url: reference.url ?? null,
        domain: reference.domain ?? null,
        title: reference.title ?? reference.source ?? null,
      })),
    ),
    searchResults: [],
    brandEntities: [],
    fanOutQueries: [],
    webSearch: true,
    checkUrl: serp.check_url ?? null,
    fetchedAt: toIsoDateTime(serp.datetime),
    usage: null,
  };
}

// ── Requests ────────────────────────────────────────────────────────────────────────

function checkPrompt(prompt: string, max: number): string {
  const value = prompt.trim();
  if (value.length === 0 || value.length > max) {
    throw new RangeError(`prompt must be 1–${max} characters`);
  }
  return value;
}

function checkTag(tag: string | undefined): string | undefined {
  if (tag !== undefined && tag.length > MAX_TAG_LENGTH) {
    throw new RangeError(`tag must be at most ${MAX_TAG_LENGTH} characters`);
  }
  return tag;
}

function checkBatch(count: number): void {
  if (count > MAX_TASKS_PER_POST) {
    throw new RangeError(`At most ${MAX_TASKS_PER_POST} tasks can be posted at once`);
  }
}

export interface LlmScraperTaskInput {
  prompt: string;
  locationCode: number;
  languageCode: string;
  /** ChatGPT only: ask the model to search the web (no guarantee it cites sources). */
  forceWebSearch?: boolean;
  tag?: string;
  priority?: "normal" | "high";
}

export interface LlmResponsesTaskInput {
  prompt: string;
  /** A model from {@link getLlmResponsesModels}; a base name selects its latest version. */
  model: string;
  webSearch?: boolean;
  /** Where the model searches from (ISO 3166-1 alpha-2), when it searches. */
  webSearchCountry?: string;
  maxOutputTokens?: number;
  tag?: string;
}

export interface AiModeTaskInput {
  prompt: string;
  locationCode: number;
  languageCode: string;
  device?: SerpDevice;
  tag?: string;
  priority?: "normal" | "high";
}

function scraperBody(platform: LlmScraperPlatform, input: LlmScraperTaskInput) {
  return compact({
    // DataForSEO decodes `%XX` and `+` in this field, like in SERP keywords.
    keyword: encodeSerpKeyword(checkPrompt(input.prompt, MAX_SCRAPER_PROMPT_LENGTH)),
    location_code: input.locationCode,
    language_code: input.languageCode,
    force_web_search: platform === "chat_gpt" ? input.forceWebSearch : undefined,
    tag: checkTag(input.tag),
    priority: input.priority ? (input.priority === "high" ? 2 : 1) : undefined,
  });
}

function responsesBody(platform: LlmResponsesPlatform, input: LlmResponsesTaskInput) {
  if (!input.model.trim()) throw new RangeError("model is required");
  return compact({
    user_prompt: checkPrompt(input.prompt, MAX_LLM_PROMPT_LENGTH),
    model_name: input.model.trim(),
    // Perplexity Sonar models always search; the flag is not part of its request.
    web_search: platform === "perplexity" ? undefined : input.webSearch,
    web_search_country_iso_code: input.webSearchCountry?.toUpperCase(),
    max_output_tokens: input.maxOutputTokens,
    tag: checkTag(input.tag),
  });
}

function aiModeBody(input: AiModeTaskInput) {
  return compact({
    keyword: encodeSerpKeyword(checkPrompt(input.prompt, MAX_AI_MODE_QUERY_LENGTH)),
    location_code: input.locationCode,
    language_code: input.languageCode,
    device: input.device,
    tag: checkTag(input.tag),
    priority: input.priority ? (input.priority === "high" ? 2 : 1) : undefined,
  });
}

// ── Endpoints ───────────────────────────────────────────────────────────────────────

async function taskResult(
  client: DataForSeoClient,
  path: string,
  id: string,
  parse: (result: unknown, path: string) => AiAnswer | null,
): Promise<AiTaskResult> {
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
  const answer = first === undefined || first === null ? null : parse(first, path);
  return answer
    ? { status: "ready", id: task.id, tag, answer, cost: task.cost }
    : { status: "no_results", id: task.id, tag, cost: task.cost };
}

/** Queues prompts for ChatGPT or Gemini as users see them (Standard queue, billed on posting). */
export async function postLlmScraperTasks(
  client: DataForSeoClient,
  platform: LlmScraperPlatform,
  inputs: readonly LlmScraperTaskInput[],
): Promise<{ cost: number; tasks: PostedTask[] }> {
  checkBatch(inputs.length);
  const bodies = inputs.map((input) => scraperBody(platform, input));
  return postTaskBatch(client, llmScraperTaskPostPath(platform), bodies);
}

export function getReadyLlmScraperTasks(
  client: DataForSeoClient,
  platform: LlmScraperPlatform,
): Promise<{ cost: number; tasks: ReadyTask[] }> {
  return getReadyTaskList(client, llmScraperTasksReadyPath(platform));
}

/** Result of an LLM Scraper task. Free. */
export function getLlmScraperTask(
  client: DataForSeoClient,
  platform: LlmScraperPlatform,
  id: string,
): Promise<AiTaskResult> {
  return taskResult(client, llmScraperTaskGetPath(platform, id), id, parseLlmScraperAnswer);
}

/**
 * Queues prompts for a model API (Standard queue). Not available for Perplexity, which only
 * answers live ({@link getLlmResponsesLive}).
 */
export async function postLlmResponsesTasks(
  client: DataForSeoClient,
  platform: Exclude<LlmResponsesPlatform, "perplexity">,
  inputs: readonly LlmResponsesTaskInput[],
): Promise<{ cost: number; tasks: PostedTask[] }> {
  checkBatch(inputs.length);
  const bodies = inputs.map((input) => responsesBody(platform, input));
  return postTaskBatch(client, llmResponsesTaskPostPath(platform), bodies);
}

export function getReadyLlmResponsesTasks(
  client: DataForSeoClient,
  platform: Exclude<LlmResponsesPlatform, "perplexity">,
): Promise<{ cost: number; tasks: ReadyTask[] }> {
  return getReadyTaskList(client, llmResponsesTasksReadyPath(platform));
}

/** Result of an LLM Responses task. Free. */
export function getLlmResponsesTask(
  client: DataForSeoClient,
  platform: Exclude<LlmResponsesPlatform, "perplexity">,
  id: string,
): Promise<AiTaskResult> {
  return taskResult(client, llmResponsesTaskGetPath(platform, id), id, parseLlmResponsesAnswer);
}

/** An answer from a model API in the same request (Live; required for Perplexity). */
export async function getLlmResponsesLive(
  client: DataForSeoClient,
  platform: LlmResponsesPlatform,
  input: LlmResponsesTaskInput,
): Promise<{ answer: AiAnswer | null; cost: number }> {
  const path = llmResponsesLivePath(platform);
  const response = await client.post<unknown>(path, [responsesBody(platform, input)]);
  const task = firstTask(response, path);
  if (!task.ok) {
    if (task.statusCode === STATUS_NO_SEARCH_RESULTS) return { answer: null, cost: response.cost };
    throw task.error;
  }
  const first = task.result[0];
  return {
    answer: first === undefined || first === null ? null : parseLlmResponsesAnswer(first, path),
    cost: response.cost,
  };
}

export interface LlmModel {
  name: string;
  webSearch: boolean;
  /** Whether the Standard queue (task_post) accepts the model. */
  standard: boolean;
}

/** Models a platform offers through LLM Responses. */
export async function getLlmResponsesModels(
  client: DataForSeoClient,
  platform: LlmResponsesPlatform,
): Promise<{ models: LlmModel[]; cost: number }> {
  const path = llmResponsesModelsPath(platform);
  const { result, cost } = await client.getOne<unknown>(path);
  const models = parseResponse(z.array(ModelSchema), result, path);
  return {
    cost,
    models: models.map((model) => ({
      name: model.model_name,
      webSearch: model.web_search_supported ?? false,
      standard: model.task_post_supported ?? false,
    })),
  };
}

/** Queues Google AI Mode queries (Standard queue, billed on posting). */
export async function postAiModeTasks(
  client: DataForSeoClient,
  inputs: readonly AiModeTaskInput[],
): Promise<{ cost: number; tasks: PostedTask[] }> {
  checkBatch(inputs.length);
  return postTaskBatch(client, AI_MODE_TASK_POST_PATH, inputs.map(aiModeBody));
}

export function getReadyAiModeTasks(
  client: DataForSeoClient,
): Promise<{ cost: number; tasks: ReadyTask[] }> {
  return getReadyTaskList(client, AI_MODE_TASKS_READY_PATH);
}

/** Result of a Google AI Mode task. Free. */
export function getAiModeTask(client: DataForSeoClient, id: string): Promise<AiTaskResult> {
  return taskResult(client, aiModeTaskGetPath(id), id, parseAiModeAnswer);
}
