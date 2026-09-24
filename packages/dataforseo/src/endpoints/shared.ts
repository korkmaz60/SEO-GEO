import type { z } from "zod";

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
