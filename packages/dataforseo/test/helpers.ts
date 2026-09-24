import { readFileSync } from "node:fs";

import { vi } from "vitest";

import { DataForSeoClient } from "../src/index.js";

export type Reply = { status?: number; body?: unknown } | Error;

export interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

/** A fetch that answers with the given replies in order and records the requests. */
export function fakeFetch(...replies: Reply[]) {
  const calls: RecordedCall[] = [];
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = replies.shift();
    if (!reply) throw new Error("unexpected request");
    if (reply instanceof Error) throw reply;
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

export function testClient(fetch: typeof globalThis.fetch): DataForSeoClient {
  return new DataForSeoClient({
    login: "api@example.com",
    password: "secret",
    fetch,
    sleep: async () => {},
    maxRetries: 0,
  });
}

export function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, import.meta.url), "utf8"));
}

/** A successful envelope around one task. */
export function envelope(task: Record<string, unknown>, cost = 0) {
  return {
    version: "0.1.20260901",
    status_code: 20000,
    status_message: "Ok.",
    cost,
    tasks_count: 1,
    tasks_error: task.status_code === 20000 ? 0 : 1,
    tasks: [{ id: "task-1", status_code: 20000, status_message: "Ok.", cost, data: {}, ...task }],
  };
}
