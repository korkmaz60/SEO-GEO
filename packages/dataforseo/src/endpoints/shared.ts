import { z } from "zod";

import type { DataForSeoClient, TaskOutcome } from "../client.js";
import { DataForSeoError } from "../errors.js";

/** Validates part of a response; a mismatch means the API changed under us. */
export function parseResponse<T extends z.ZodType>(
  schema: T,
  value: unknown,
  path: string,
): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new DataForSeoError({
      kind: "invalid_response",
      message: `Unexpected response from ${path}`,
      path,
      retryable: false,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

const DATE_TIME = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?) ?([+-]\d{2}:\d{2})$/;

/**
 * DataForSEO timestamps look like `2026-09-24 06:12:31 +00:00`. Returns ISO 8601, or `null`
 * for missing or unparsable values.
 */
export function toIsoDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = DATE_TIME.exec(value.trim());
  const date = new Date(match ? `${match[1]}T${match[2]}${match[3]}` : value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Drops `undefined` values so request bodies only carry what was set. */
export function compact(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}

/** DataForSEO accepts at most this many tasks per `task_post` request. */
export const MAX_TASKS_PER_POST = 100;

export type PostedTask =
  | { ok: true; id: string; tag: string | null; cost: number }
  | { ok: false; id: string; tag: string | null; error: DataForSeoError };

export interface ReadyTask {
  id: string;
  tag: string | null;
  postedAt: string | null;
}

/**
 * Posts Standard-queue tasks and pairs every outcome with its input. DataForSEO bills at
 * posting time, so the returned costs are final.
 */
export async function postTaskBatch(
  client: DataForSeoClient,
  path: string,
  bodies: readonly Record<string, unknown>[],
): Promise<{ cost: number; tasks: PostedTask[] }> {
  if (bodies.length === 0) return { cost: 0, tasks: [] };
  if (bodies.length > MAX_TASKS_PER_POST) {
    throw new RangeError(`At most ${MAX_TASKS_PER_POST} tasks can be posted at once`);
  }
  const response = await client.post<unknown>(path, bodies);
  if (response.tasks.length !== bodies.length) {
    throw new DataForSeoError({
      kind: "invalid_response",
      message: `Posted ${bodies.length} tasks but received ${response.tasks.length}`,
      path,
      retryable: false,
    });
  }
  return {
    cost: response.cost,
    tasks: response.tasks.map((task, index) => {
      const sent = bodies[index]?.tag;
      const tag = tagOf(task) ?? (typeof sent === "string" ? sent : null);
      return task.ok
        ? { ok: true, id: task.id, tag, cost: task.cost }
        : { ok: false, id: task.id, tag, error: task.error };
    }),
  };
}

const ReadyTaskSchema = z.looseObject({
  id: z.string(),
  tag: z.string().nullish().catch(null),
  date_posted: z.string().nullish().catch(null),
});

/**
 * Completed Standard-queue tasks of one endpoint whose results have not been collected yet
 * (up to 1000 per call). Free. The list covers the whole DataForSEO account, including tasks
 * posted by other software, so callers only collect the IDs they know.
 */
export async function getReadyTaskList(
  client: DataForSeoClient,
  path: string,
): Promise<{ cost: number; tasks: ReadyTask[] }> {
  const { result, cost } = await client.getOne<unknown>(path);
  const tasks = parseResponse(z.array(ReadyTaskSchema), result, path);
  return {
    cost,
    tasks: tasks.map((task) => ({
      id: task.id,
      tag: task.tag ?? null,
      postedAt: toIsoDateTime(task.date_posted),
    })),
  };
}

export function firstTask<T>(response: { tasks: TaskOutcome<T>[] }, path: string): TaskOutcome<T> {
  const task = response.tasks[0];
  if (!task) {
    throw new DataForSeoError({
      kind: "invalid_response",
      message: "DataForSEO response contained no tasks",
      path,
      retryable: false,
    });
  }
  return task;
}

export function tagOf(task: TaskOutcome<unknown>): string | null {
  const tag = task.data.tag;
  return typeof tag === "string" && tag.length > 0 ? tag : null;
}

/** Host name of a URL, or `null` when it cannot be parsed. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
