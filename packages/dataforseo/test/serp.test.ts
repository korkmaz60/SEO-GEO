import { describe, expect, it } from "vitest";

import {
  DataForSeoError,
  encodeSerpKeyword,
  getGoogleOrganicLiveAdvanced,
  getGoogleOrganicTaskAdvanced,
  getReadyGoogleOrganicTasks,
  parseGoogleOrganicSerp,
  postGoogleOrganicTasks,
  type GoogleOrganicTaskInput,
} from "../src/index.js";
import { envelope, fakeFetch, fixture, testClient } from "./helpers.js";

const TASK_ID = "09241012-1535-0066-0000-5d1b0c1f2a3e";
const TAG = "01926f3e-7a3b-7c11-9d2e-3f4a5b6c7d8e";

const input: GoogleOrganicTaskInput = {
  keyword: "kahve makinesi",
  locationCode: 2792,
  languageCode: "tr",
  device: "desktop",
  depth: 30,
  loadAsyncAiOverview: true,
  tag: TAG,
};

describe("postGoogleOrganicTasks", () => {
  it("posts Standard queue tasks and reports each task's outcome and the cost", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("serp-google-organic-task-post") });
    const result = await postGoogleOrganicTasks(testClient(fetch), [
      { ...input, priority: "normal", pingbackUrl: "https://seo.example.com/ping?id=$id" },
      { ...input, keyword: "espresso makinesi", locationCode: 1, tag: `${TAG.slice(0, -1)}f` },
    ]);

    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.dataforseo.com/v3/serp/google/organic/task_post",
    });
    expect(calls[0]?.body).toEqual([
      {
        keyword: "kahve makinesi",
        location_code: 2792,
        language_code: "tr",
        device: "desktop",
        depth: 30,
        load_async_ai_overview: true,
        tag: TAG,
        priority: 1,
        pingback_url: "https://seo.example.com/ping?id=$id",
      },
      {
        keyword: "espresso makinesi",
        location_code: 1,
        language_code: "tr",
        device: "desktop",
        depth: 30,
        load_async_ai_overview: true,
        tag: `${TAG.slice(0, -1)}f`,
      },
    ]);
    expect(result.cost).toBe(0.0021);
    expect(result.tasks[0]).toEqual({ ok: true, id: TASK_ID, tag: TAG, cost: 0.0021 });
    const failed = result.tasks[1];
    expect(failed?.ok).toBe(false);
    if (failed?.ok === false) {
      expect(failed.tag).toBe(`${TAG.slice(0, -1)}f`);
      expect(failed.error).toMatchObject({ kind: "task", statusCode: 40501, retryable: false });
    }
  });

  it("validates the batch before sending anything", async () => {
    const { fetch, calls } = fakeFetch();
    const client = testClient(fetch);
    await expect(postGoogleOrganicTasks(client, [])).resolves.toEqual({ cost: 0, tasks: [] });
    await expect(
      postGoogleOrganicTasks(
        client,
        Array.from({ length: 101 }, () => input),
      ),
    ).rejects.toThrow(RangeError);
    await expect(postGoogleOrganicTasks(client, [{ ...input, depth: 701 }])).rejects.toThrow(
      RangeError,
    );
    await expect(postGoogleOrganicTasks(client, [{ ...input, keyword: "  " }])).rejects.toThrow(
      RangeError,
    );
    expect(calls).toHaveLength(0);
  });
});

describe("encodeSerpKeyword", () => {
  it("keeps + and % literal", () => {
    expect(encodeSerpKeyword("c++ 100% pamuk")).toBe("c%2B%2B 100%25 pamuk");
  });
});

describe("getReadyGoogleOrganicTasks", () => {
  it("lists completed tasks with their tags", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("serp-google-organic-tasks-ready") });
    const ready = await getReadyGoogleOrganicTasks(testClient(fetch));
    expect(calls[0]).toMatchObject({
      method: "GET",
      url: "https://api.dataforseo.com/v3/serp/google/organic/tasks_ready",
    });
    expect(ready.tasks).toEqual([
      { id: TASK_ID, tag: TAG, postedAt: "2026-09-24T06:10:02.000Z" },
      {
        id: "09241012-1535-0066-0000-ffffffffffff",
        tag: null,
        postedAt: "2026-09-24T06:10:05.000Z",
      },
    ]);
  });

  it("returns an empty list when nothing is ready", async () => {
    const { fetch } = fakeFetch({ body: envelope({ result: null }) });
    expect((await getReadyGoogleOrganicTasks(testClient(fetch))).tasks).toEqual([]);
  });
});

describe("getGoogleOrganicTaskAdvanced", () => {
  it("parses organic results, SERP features and the AI Overview", async () => {
    const { fetch, calls } = fakeFetch({ body: fixture("serp-google-organic-task-get-advanced") });
    const result = await getGoogleOrganicTaskAdvanced(testClient(fetch), TASK_ID);
    expect(calls[0]?.url).toBe(
      `https://api.dataforseo.com/v3/serp/google/organic/task_get/advanced/${TASK_ID}`,
    );
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.tag).toBe(TAG);

    const { serp } = result;
    expect(serp).toMatchObject({
      keyword: "kahve makinesi",
      locationCode: 2792,
      languageCode: "tr",
      seDomain: "google.com.tr",
      fetchedAt: "2026-09-24T06:12:31.000Z",
      spell: null,
      resultsCount: 48200000,
      pagesCount: 3,
    });
    expect(serp.itemTypes).toContain("ai_overview");
    expect(
      serp.organic.map((entry) => [entry.rankGroup, entry.rankAbsolute, entry.domain]),
    ).toEqual([
      [1, 4, "www.example.org"],
      [2, 6, "tr.wikipedia.org"],
      [3, 7, "www.example.com"],
      [4, 10, "blog.example.com"],
      [5, 11, "www.example.net"],
    ]);
    expect(serp.organic[2]).toMatchObject({
      url: "https://www.example.com/kahve-makineleri",
      title: "Kahve Makineleri | Example Kahve",
      page: 1,
    });

    expect(serp.features.map((feature) => feature.type)).toEqual([
      "ai_overview",
      "paid",
      "featured_snippet",
      "people_also_ask",
      "local_pack",
      "video",
      "related_searches",
    ]);
    const byType = Object.fromEntries(serp.features.map((feature) => [feature.type, feature]));
    expect(byType.featured_snippet?.links).toEqual([
      { domain: "www.example.org", url: "https://www.example.org/kahve-makinesi" },
    ]);
    expect(byType.people_also_ask?.links).toEqual([
      { domain: "blog.example.com", url: "https://blog.example.com/en-iyi-kahve-makinesi" },
    ]);
    // Domains are derived from URLs when the element has none.
    expect(byType.video?.links).toEqual([
      { domain: "www.youtube.com", url: "https://www.youtube.com/watch?v=abc123" },
    ]);
    expect(byType.related_searches?.links).toEqual([]);

    expect(serp.aiOverview).toEqual({
      rankAbsolute: 1,
      asynchronous: true,
      markdown:
        "Kahve makinesi seçerken **demleme yöntemi**, kapasite ve bakım kolaylığı öne çıkar.",
      references: [
        {
          domain: "tr.wikipedia.org",
          url: "https://tr.wikipedia.org/wiki/Kahve_makinesi",
          title: "Kahve makinesi - Vikipedi",
          source: "Vikipedi",
        },
        {
          domain: "www.example.com",
          url: "https://www.example.com/rehber/kahve-makinesi-secimi",
          title: "Kahve makinesi nasıl seçilir?",
          source: "Example Kahve",
        },
        {
          domain: "www.example.org",
          url: "https://www.example.org/kahve-makinesi",
          title: "Kahve Makinesi Modelleri ve Fiyatları",
          source: "Example Market",
        },
      ],
    });
  });

  it("reports queued and running tasks as pending", async () => {
    for (const [code, message] of [
      [40602, "Task In Queue."],
      [40601, "Task Handed."],
    ] as const) {
      const { fetch } = fakeFetch({
        body: envelope({ id: TASK_ID, status_code: code, status_message: message, result: null }),
      });
      expect(await getGoogleOrganicTaskAdvanced(testClient(fetch), TASK_ID)).toEqual({
        status: "pending",
        id: TASK_ID,
      });
    }
  });

  it("reports an empty SERP as no_results and fails on other task errors", async () => {
    const { fetch } = fakeFetch(
      {
        body: envelope({
          id: TASK_ID,
          status_code: 40102,
          status_message: "No Search Results.",
          data: { tag: TAG },
          result: null,
        }),
      },
      {
        body: envelope({
          id: TASK_ID,
          status_code: 40401,
          status_message: "Task Not Found.",
          result: null,
        }),
      },
    );
    const client = testClient(fetch);
    expect(await getGoogleOrganicTaskAdvanced(client, TASK_ID)).toEqual({
      status: "no_results",
      id: TASK_ID,
      tag: TAG,
      cost: 0,
    });
    await expect(getGoogleOrganicTaskAdvanced(client, TASK_ID)).rejects.toMatchObject({
      kind: "task",
      statusCode: 40401,
    });
  });

  it("rejects results that do not match the schema", async () => {
    const { fetch } = fakeFetch({
      body: envelope({
        id: TASK_ID,
        result: [{ keyword: "x", items: [{ type: "organic", rank_group: "1" }] }],
      }),
    });
    const error = await getGoogleOrganicTaskAdvanced(testClient(fetch), TASK_ID).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(DataForSeoError);
    expect(error).toMatchObject({ kind: "invalid_response", retryable: false });
  });
});

describe("getGoogleOrganicLiveAdvanced", () => {
  it("fetches a SERP in the same request", async () => {
    const recorded = fixture("serp-google-organic-task-get-advanced") as {
      tasks: { result: unknown[] }[];
    };
    const { fetch, calls } = fakeFetch({
      body: envelope({ id: TASK_ID, cost: 0.0026, result: recorded.tasks[0]?.result }, 0.0026),
    });
    const { serp, cost } = await getGoogleOrganicLiveAdvanced(testClient(fetch), {
      keyword: "kahve makinesi",
      locationCode: 2792,
      languageCode: "tr",
    });
    expect(calls[0]).toMatchObject({
      method: "POST",
      url: "https://api.dataforseo.com/v3/serp/google/organic/live/advanced",
      body: [{ keyword: "kahve makinesi", location_code: 2792, language_code: "tr" }],
    });
    expect(cost).toBe(0.0026);
    expect(serp?.organic).toHaveLength(5);
  });

  it("returns no SERP when Google has no results", async () => {
    const { fetch } = fakeFetch({
      body: envelope({ status_code: 40102, status_message: "No Search Results.", result: null }),
    });
    const live = await getGoogleOrganicLiveAdvanced(testClient(fetch), input);
    expect(live.serp).toBeNull();
  });
});

describe("parseGoogleOrganicSerp", () => {
  it("handles a SERP without items and spelling corrections", () => {
    const serp = parseGoogleOrganicSerp({
      keyword: "kahve makinsi",
      spell: { keyword: "kahve makinesi", type: "showing_results_for" },
      item_types: null,
      items: null,
      datetime: "not a date",
    });
    expect(serp).toMatchObject({
      spell: { keyword: "kahve makinesi", type: "showing_results_for" },
      itemTypes: [],
      organic: [],
      features: [],
      aiOverview: null,
      fetchedAt: null,
    });
  });
});
