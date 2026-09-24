import { ProblemDetailsSchema, type ProblemDetails } from "@seo-geo/contracts";
import type { z } from "zod";

/** Browser requests go to the web origin; the proxy route forwards /api/* to the api. */
export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.name = "ApiError";
  }

  /** Field errors by dotted path, e.g. `{ domain: "Not a public domain name" }`. */
  get fieldErrors(): Record<string, string> {
    return Object.fromEntries(
      (this.problem?.errors ?? []).map((error) => [error.path, error.message]),
    );
  }
}

async function send(path: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (response.status === 204) return null;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    throw new ApiError(response.status, problem.success ? problem.data : null);
  }
  return body;
}

/** Fetches a JSON endpoint and validates the response with a contract schema. */
export async function apiGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  return schema.parse(await send(path, { ...init, method: "GET" }));
}

/** POST/PUT/PATCH/DELETE with a JSON body; validates the response when a schema is given. */
export async function apiSend<TSchema extends z.ZodType>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  schema?: TSchema,
): Promise<z.output<TSchema>> {
  const result = await send(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (schema ? schema.parse(result) : result) as z.output<TSchema>;
}

/** A readable message for any error thrown by the api helpers or the auth client. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.problem?.detail ?? fallback;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message || fallback;
  }
  return fallback;
}
