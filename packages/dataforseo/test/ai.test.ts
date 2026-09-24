import { describe, expect, it } from "vitest";

import {
  estimateAiAnswerCost,
  estimateProviderAnswerCost,
  getAiModeTask,
  getLlmResponsesLive,
  getLlmResponsesModels,
  getLlmResponsesTask,
  getLlmScraperTask,
  getReadyLlmScraperTasks,
  parseLlmResponsesAnswer,
  parseLlmScraperAnswer,
  postAiModeTasks,
  postLlmResponsesTasks,
  postLlmScraperTasks,
} from "../src/index.js";
import { envelope, fakeFetch, fixture, testClient } from "./helpers.js";

const PROMPT = "Türkiye'de en iyi kahve makinesi markaları hangileri?";
const TAG = "01926f3e-0000-7c11-9d2e-00000000a001";
const SCRAPER_ID = "09241100-1535-0600-0000-c0ffee000001";

describe("LLM Scraper", () => {
  it("posts ChatGPT prompts to the Standard queue with an escaped keyword", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("ai-chat-gpt-llm-scraper-task-post") });
    const result = await postLlmScraperTasks(testClient(fetch), "chat_gpt", [
      {
        prompt: ` ${PROMPT} `,
        locationCode: 2792,
        languageCode: "tr",
        forceWebSearch: true,
        tag: TAG,
      },
      { prompt: "100% c++", locationCode: 1, languageCode: "tr", tag: `${TAG.slice(0, -1)}2` },
    ]);

    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_post",
    });
    expect(calls[0]?.body).toEqual([
      {
        keyword: PROMPT,
        location_code: 2792,
        language_code: "tr",
        force_web_search: true,
        tag: TAG,
      },
      {
        keyword: "100%25 c%2B%2B",
        location_code: 1,
        language_code: "tr",
        tag: `${TAG.slice(0, -1)}2`,
      },
    ]);
    expect(result.cost).toBe(0.0024);
    expect(result.tasks[0]).toEqual({ ok: true, id: SCRAPER_ID, tag: TAG, cost: 0.0012 });
    expect(result.tasks[1]).toMatchObject({ ok: false, error: { statusCode: 40501 } });
  });

  it("does not send ChatGPT-only options to Gemini and validates prompts before sending", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("ai-chat-gpt-llm-scraper-task-post") });
    const client = testClient(fetch);
    await expect(
      postLlmScraperTasks(client, "gemini", [
        { prompt: "  ", locationCode: 2792, languageCode: "tr" },
      ]),
    ).rejects.toThrow(RangeError);
    await expect(
      postLlmScraperTasks(
        client,
        "gemini",
        Array.from({ length: 101 }, () => ({
          prompt: "x",
          locationCode: 2792,
          languageCode: "tr",
        })),
      ),
    ).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);

    await postLlmScraperTasks(client, "gemini", [
      { prompt: PROMPT, locationCode: 2792, languageCode: "tr", forceWebSearch: true, tag: TAG },
      { prompt: "x", locationCode: 1, languageCode: "tr" },
    ]);
    expect(calls[0]?.url).toBe(
      "https://api.dataforseo.com/v3/ai_optimization/gemini/llm_scraper/task_post",
    );
    expect(calls[0]?.body).toEqual([
      { keyword: PROMPT, location_code: 2792, language_code: "tr", tag: TAG },
      { keyword: "x", location_code: 1, language_code: "tr" },
    ]);
  });

  it("reads the answer as users see it: text, cited sources, search results and brands", async () => {
    const { fetch, calls } = fakeFetch({
      body: fixture("ai-chat-gpt-llm-scraper-task-get-advanced"),
    });
    const result = await getLlmScraperTask(testClient(fetch), "chat_gpt", SCRAPER_ID);

    expect(calls[0]?.url).toBe(
      `https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/task_get/advanced/${SCRAPER_ID}`,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.tag).toBe(TAG);
    const { answer } = result;
    expect(answer.text).toMatch(/^Türkiye'de öne çıkan kahve makinesi markaları/);
    expect(answer.model).toBe("gpt-5");
    // The repeated source is listed once, keeping the first rank.
    expect(answer.sources).toEqual([
      {
        rank: 1,
        url: "https://www.example.com/kahve-makineleri",
        domain: "www.example.com",
        title: "Kahve Makineleri | Example Store",
      },
      {
        rank: 2,
        url: "https://www.rakip-a.com/blog/en-iyi-kahve-makineleri",
        domain: "www.rakip-a.com",
        title: "En iyi kahve makineleri 2026",
      },
    ]);
    expect(answer.searchResults.map((entry) => entry.domain)).toEqual([
      "www.example.com",
      "tr.wikipedia.org",
      "www.rakip-a.com",
    ]);
    expect(answer.brandEntities).toEqual([
      { name: "Example Store", category: "Retailer", urls: ["https://www.example.com/"] },
      { name: "Rakip A", category: null, urls: [] },
    ]);
    expect(answer.fanOutQueries).toEqual([
      "en iyi kahve makinesi markaları 2026",
      "kahve makinesi marka karşılaştırma",
    ]);
    expect(answer.webSearch).toBe(true);
    expect(answer.fetchedAt).toBe("2026-09-24T10:12:31.000Z");
    expect(answer.usage).toBeNull();
  });

  it("reports pending tasks and answers without text", async () => {
    const pending = envelope({
      id: SCRAPER_ID,
      status_code: 40602,
      status_message: "Task In Queue.",
      result: null,
    });
    const empty = envelope({
      id: SCRAPER_ID,
      result: [{ keyword: PROMPT, markdown: null, items: [] }],
    });
    const { fetch } = fakeFetch({ body: pending }, { body: empty });
    const client = testClient(fetch);
    await expect(getLlmScraperTask(client, "gemini", SCRAPER_ID)).resolves.toEqual({
      status: "pending",
      id: SCRAPER_ID,
    });
    await expect(getLlmScraperTask(client, "gemini", SCRAPER_ID)).resolves.toMatchObject({
      status: "no_results",
    });
  });

  it("lists ready tasks of a platform", async () => {
    const ready = envelope({
      result: [
        {
          id: SCRAPER_ID,
          se: "chat_gpt",
          se_type: "llm_scraper",
          date_posted: "2026-09-24 10:10:02 +00:00",
          tag: TAG,
        },
      ],
    });
    const { fetch, calls } = fakeFetch({ body: ready });
    const result = await getReadyLlmScraperTasks(testClient(fetch), "chat_gpt");
    expect(calls[0]?.url).toBe(
      "https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/tasks_ready",
    );
    expect(result.tasks).toEqual([
      { id: SCRAPER_ID, tag: TAG, postedAt: "2026-09-24T10:10:02.000Z" },
    ]);
  });
});

describe("LLM Responses", () => {
  it("asks a model live, with web search, and reads text, sources and token costs", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("ai-claude-llm-responses-live") });
    const result = await getLlmResponsesLive(testClient(fetch), "claude", {
      prompt: PROMPT,
      model: "claude-haiku-4-5",
      webSearch: true,
      webSearchCountry: "tr",
      tag: "t1",
    });

    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.dataforseo.com/v3/ai_optimization/claude/llm_responses/live",
    });
    expect(calls[0]?.body).toEqual([
      {
        user_prompt: PROMPT,
        model_name: "claude-haiku-4-5",
        web_search: true,
        web_search_country_iso_code: "TR",
        tag: "t1",
      },
    ]);
    expect(result.cost).toBe(0.026868);
    const answer = result.answer;
    expect(answer?.text).toContain("Example Store");
    expect(answer?.text).toContain("\n\nRakip A ise");
    expect(answer?.model).toBe("claude-haiku-4-5-20251001");
    expect(answer?.sources.map((source) => [source.rank, source.domain])).toEqual([
      [1, "www.example.com"],
      [2, "tr.wikipedia.org"],
      [3, "www.rakip-a.com"],
    ]);
    expect(answer?.usage).toEqual({
      inputTokens: 14210,
      outputTokens: 412,
      reasoningTokens: 0,
      providerCostUsd: 0.026268,
    });
  });

  it("uses Gemini's direct URLs instead of its redirects and leaves reasoning out", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("ai-gemini-llm-responses-task-get") });
    const id = "09241102-1535-0602-0000-6e0000000001";
    const result = await getLlmResponsesTask(testClient(fetch), "gemini", id);
    expect(calls[0]?.url).toBe(
      `https://api.dataforseo.com/v3/ai_optimization/gemini/llm_responses/task_get/${id}`,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.answer.text).toBe(
      "Example Store ve Rakip A Türkiye'de sık önerilen markalardır.",
    );
    expect(result.answer.sources).toEqual([
      {
        rank: 1,
        url: "https://www.example.com/kahve-makineleri",
        domain: "www.example.com",
        title: "example.com",
      },
    ]);
  });

  it("does not send web_search for Perplexity, which always searches", async () => {
    const answer = fixture("ai-claude-llm-responses-live");
    const { fetch, calls } = fakeFetch({ body: answer });
    await getLlmResponsesLive(testClient(fetch), "perplexity", {
      prompt: PROMPT,
      model: "sonar",
      webSearch: true,
    });
    expect(calls[0]?.url).toBe(
      "https://api.dataforseo.com/v3/ai_optimization/perplexity/llm_responses/live",
    );
    expect(calls[0]?.body).toEqual([{ user_prompt: PROMPT, model_name: "sonar" }]);
  });

  it("limits prompts to 500 characters and needs a model", async () => {
    const { fetch, calls } = fakeFetch();
    const client = testClient(fetch);
    await expect(
      getLlmResponsesLive(client, "claude", { prompt: "x".repeat(501), model: "claude-haiku-4-5" }),
    ).rejects.toThrow(RangeError);
    await expect(
      postLlmResponsesTasks(client, "claude", [{ prompt: PROMPT, model: " " }]),
    ).rejects.toThrow(RangeError);
    expect(calls).toHaveLength(0);
  });

  it("lists models with their capabilities", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("ai-claude-llm-responses-models") });
    const result = await getLlmResponsesModels(testClient(fetch), "claude");
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.dataforseo.com/v3/ai_optimization/claude/llm_responses/models",
    });
    expect(result.models).toEqual([
      { name: "claude-sonnet-4-5-20250929", webSearch: true, standard: true },
      { name: "claude-haiku-4-5-20251001", webSearch: true, standard: true },
      { name: "claude-3-haiku-20240307", webSearch: false, standard: true },
    ]);
  });

  it("treats answers without text as empty", () => {
    expect(
      parseLlmResponsesAnswer(
        { model_name: "m", items: [{ type: "message", sections: [] }] },
        "/x",
      ),
    ).toBeNull();
    expect(parseLlmScraperAnswer({ markdown: "   " }, "/x")).toBeNull();
  });
});

describe("Google AI Mode", () => {
  it("posts queries and reads the answer with its references", async () => {
    const post = {
      ...envelope(
        { id: "a", status_code: 20100, status_message: "Task Created.", cost: 0.0012 },
        0.0012,
      ),
    };
    const { fetch, calls } = fakeFetch(
      { body: post },
      { body: fixture("serp-google-ai-mode-task-get-advanced") },
    );
    const client = testClient(fetch);
    const posted = await postAiModeTasks(client, [
      { prompt: PROMPT, locationCode: 2792, languageCode: "tr", device: "desktop", tag: TAG },
    ]);
    expect(calls[0]?.url).toBe("https://api.dataforseo.com/v3/serp/google/ai_mode/task_post");
    expect(calls[0]?.body).toEqual([
      { keyword: PROMPT, location_code: 2792, language_code: "tr", device: "desktop", tag: TAG },
    ]);
    expect(posted.tasks[0]).toMatchObject({ ok: true, cost: 0.0012 });

    const id = "09241104-1535-0066-0000-a10de0000001";
    const result = await getAiModeTask(client, id);
    expect(calls[1]?.url).toBe(
      `https://api.dataforseo.com/v3/serp/google/ai_mode/task_get/advanced/${id}`,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.answer.text).toMatch(/\*\*Example Store\*\*/);
    expect(
      result.answer.sources.map((source) => [source.rank, source.domain, source.title]),
    ).toEqual([
      [1, "www.example.com", "Kahve Makineleri"],
      [2, "tr.wikipedia.org", "Kahve makinesi"],
      [3, "www.rakip-a.com", "En iyi kahve makineleri 2026"],
    ]);
    expect(result.answer.checkUrl).toContain("udm=50");
  });
});

describe("AI answer costs", () => {
  it("prices answers by method and model family", () => {
    expect(estimateAiAnswerCost({ method: "llm_scraper" })).toBe(0.0012);
    expect(estimateAiAnswerCost({ method: "llm_scraper" }, { mode: "live" })).toBe(0.004);
    expect(estimateAiAnswerCost({ method: "google_ai_mode" }, { count: 10 })).toBe(0.012);
    // First organic page plus the asynchronous AI Overview.
    expect(estimateAiAnswerCost({ method: "google_ai_overview" })).toBe(0.0012);
    expect(
      estimateAiAnswerCost({ method: "llm_responses", model: "sonar" }, { mode: "live" }),
    ).toBe(0.0106);
    expect(estimateProviderAnswerCost("claude-haiku-4-5")).toBe(0.05);
    expect(estimateProviderAnswerCost("claude-sonnet-4-5-20250929")).toBe(0.15);
    expect(estimateProviderAnswerCost("sonar-pro")).toBe(0.03);
    expect(estimateProviderAnswerCost("some-new-model")).toBe(0.15);
  });
});
