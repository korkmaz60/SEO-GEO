import { ProblemDetailsSchema, type ProblemDetails } from "@seo-geo/contracts";
import type { z } from "zod";

/** Browser requests go to the web origin; Next.js forwards /api/* to the NestJS api. */
export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `Request failed with status ${status}`);
    this.name = "ApiError";
  }
}

/** Fetches a JSON endpoint and validates the response with a contract schema. */
export async function apiGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
  init?: RequestInit,
): Promise<z.output<TSchema>> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const problem = ProblemDetailsSchema.safeParse(body);
    throw new ApiError(response.status, problem.success ? problem.data : null);
  }
  return schema.parse(body);
}
