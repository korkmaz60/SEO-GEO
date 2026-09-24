import { describe, expect, it, vi } from "vitest";

import { DataForSeoClient, DataForSeoError, getAccountInfo } from "../src/index.js";

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

function fakeFetch(...replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    if (reply instanceof Error) throw reply;
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return new Response(text, { status: reply.status ?? 200, headers: reply.headers });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function envelope(tasks: unknown[], extra: Record<string, unknown> = {}) {
  return {
    version: "0.1.20260901",
    status_code: 20000,
    status_message: "Ok.",
    time: "0.1 sec.",
    cost: 0.0024,
    tasks_count: tasks.length,
    tasks_error: 0,
    tasks,
    ...extra,
  };
}

function task(result: unknown[] | null, status = 20000, message = "Ok.") {
  return {
    id: `task-${Math.random().toString(16).slice(2)}`,
    status_code: status,
    status_message: message,
    cost: status === 20000 ? 0.0012 : 0,
    data: { api: "serp" },
    result,
  };
}

function client(fetch: typeof globalThis.fetch, overrides = {}) {
  const sleep = vi.fn(async () => {});
  const instance = new DataForSeoClient({
    login: "user@example.com",
    password: "secret",
    fetch,
    sleep,
    random: () => 1,
    ...overrides,
  });
  return { instance, sleep };
}

describe("DataForSeoClient", () => {
  it("sends authenticated JSON requests to the v3 base URL", async () => {
    const { fetch, calls } = fakeFetch({ body: envelope([task([{ keyword: "seo" }])]) });
    const { instance } = client(fetch);

    const response = await instance.post("/serp/google/organic/live/advanced", [
      { keyword: "seo", location_code: 2792, language_code: "tr" },
    ]);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.dataforseo.com/v3/serp/google/organic/live/advanced");
    expect(call?.init.method).toBe("POST");
    const headers = call?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      "Basic " + Buffer.from("user@example.com:secret").toString("base64"),
    );
    expect(JSON.parse(String(call?.init.body))).toEqual([
      { keyword: "seo", location_code: 2792, language_code: "tr" },
    ]);
    expect(response.cost).toBe(0.0024);
    expect(response.tasks[0]).toMatchObject({ ok: true, result: [{ keyword: "seo" }] });
  });

  it("reports failed tasks without failing the whole batch", async () => {
    const { fetch } = fakeFetch({
      body: envelope([task([{ a: 1 }]), task(null, 40501, "Invalid Field: 'keyword'.")]),
    });
    const { instance } = client(fetch);

    const response = await instance.post("/keywords", [{}, {}]);

    expect(response.tasks.map((t) => t.ok)).toEqual([true, false]);
    const failed = response.tasks[1];
    expect(failed?.ok).toBe(false);
    if (failed && !failed.ok) {
      expect(failed.error).toMatchObject({ kind: "task", statusCode: 40501, retryable: false });
    }
  });

  it("treats task_post acknowledgements (20100) as success", async () => {
    const { fetch } = fakeFetch({ body: envelope([task(null, 20100, "Task Created.")]) });
    const { instance } = client(fetch);

    await expect(instance.postOne("/serp/google/organic/task_post", {})).resolves.toMatchObject({
      result: [],
    });
  });

  it("throws the task error from postOne", async () => {
    const { fetch } = fakeFetch({ body: envelope([task(null, 40501, "Invalid Field.")]) });
    const { instance } = client(fetch);

    await expect(instance.postOne("/keywords", {})).rejects.toMatchObject({
      kind: "task",
      statusCode: 40501,
    });
  });

  it("does not retry client errors reported in the envelope", async () => {
    const { fetch, calls } = fakeFetch({
      body: { status_code: 40200, status_message: "Payment Required.", tasks: null },
    });
    const { instance, sleep } = client(fetch);

    await expect(instance.get("/appendix/user_data")).rejects.toMatchObject({
      kind: "api",
      statusCode: 40200,
      retryable: false,
    });
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries server errors, network errors and 5xx responses", async () => {
    const { fetch, calls } = fakeFetch(
      { body: { status_code: 50000, status_message: "Internal Error.", tasks: null } },
      new TypeError("fetch failed"),
      { body: envelope([task([{ ok: true }])]) },
    );
    const { instance, sleep } = client(fetch, { maxRetries: 2, retryBaseDelayMs: 100 });

    const response = await instance.get("/appendix/user_data");

    expect(response.tasks[0]?.ok).toBe(true);
    expect(calls).toHaveLength(3);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it("gives up after maxRetries", async () => {
    const { fetch, calls } = fakeFetch({ status: 502, body: "" }, { status: 503, body: "" });
    const { instance } = client(fetch, { maxRetries: 1 });

    await expect(instance.get("/x")).rejects.toMatchObject({ kind: "http", httpStatus: 503 });
    expect(calls).toHaveLength(2);
  });

  it("honors Retry-After on 429", async () => {
    const { fetch } = fakeFetch(
      { status: 429, body: "", headers: { "retry-after": "3" } },
      { body: envelope([task([])]) },
    );
    const { instance, sleep } = client(fetch);

    await instance.get("/x");
    expect(sleep).toHaveBeenCalledWith(3000);
  });

  it("surfaces the DataForSEO message of non-2xx responses", async () => {
    const { fetch, calls } = fakeFetch({
      status: 401,
      body: { status_code: 40100, status_message: "You are not authorized." },
    });
    const { instance } = client(fetch);

    const error = await instance.get("/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DataForSeoError);
    expect(error).toMatchObject({
      kind: "http",
      httpStatus: 401,
      statusCode: 40100,
      message: "You are not authorized.",
      retryable: false,
    });
    expect(calls).toHaveLength(1);
  });

  it("classifies timeouts", async () => {
    const { fetch } = fakeFetch(new DOMException("The operation timed out.", "TimeoutError"));
    const { instance } = client(fetch, { maxRetries: 0 });

    await expect(instance.get("/x")).rejects.toMatchObject({ kind: "timeout", retryable: true });
  });

  it("rejects bodies that are not a response envelope", async () => {
    const { fetch } = fakeFetch({ body: "<html>maintenance</html>" });
    const { instance } = client(fetch);

    await expect(instance.get("/x")).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("requires credentials", () => {
    expect(() => new DataForSeoClient({ login: "", password: "x" })).toThrow();
  });
});

describe("getAccountInfo", () => {
  it("returns the login and balance from user_data", async () => {
    const { fetch, calls } = fakeFetch({
      body: envelope(
        [task([{ login: "user@example.com", money: { total: 50, balance: 12.34 } }])],
        {
          cost: 0,
        },
      ),
    });
    const { instance } = client(fetch);

    await expect(getAccountInfo(instance)).resolves.toEqual({
      login: "user@example.com",
      balanceUsd: 12.34,
    });
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.url).toBe("https://api.dataforseo.com/v3/appendix/user_data");
  });

  it("fails loudly on an unexpected shape", async () => {
    const { fetch } = fakeFetch({ body: envelope([task([{ money: {} }])]) });
    const { instance } = client(fetch);

    await expect(getAccountInfo(instance)).rejects.toMatchObject({ kind: "invalid_response" });
  });
});
