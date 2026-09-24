import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  HealthResponseSchema,
  MAX_PAGE_SIZE,
  PaginationQuerySchema,
  ProblemDetailsSchema,
  paginated,
} from "../src/index.js";

describe("PaginationQuerySchema", () => {
  it("defaults the limit and coerces query-string numbers", () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(PaginationQuerySchema.parse({ limit: "25", cursor: "abc" })).toEqual({
      limit: 25,
      cursor: "abc",
    });
  });

  it("rejects page sizes outside the allowed range", () => {
    expect(PaginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ limit: MAX_PAGE_SIZE + 1 }).success).toBe(false);
  });
});

describe("paginated", () => {
  it("builds a list envelope around an item schema", () => {
    const schema = paginated(z.object({ id: z.string() }));
    expect(schema.parse({ data: [{ id: "a" }], nextCursor: null })).toEqual({
      data: [{ id: "a" }],
      nextCursor: null,
    });
    expect(schema.safeParse({ data: [{ id: 1 }], nextCursor: null }).success).toBe(false);
  });
});

describe("ProblemDetailsSchema", () => {
  it("accepts an RFC 9457 body with field errors", () => {
    const body = {
      type: "https://seo-geo.dev/problems/validation_failed",
      title: "Validation failed",
      status: 400,
      code: "validation_failed",
      errors: [{ path: "name", message: "Required" }],
      requestId: "req-1",
    };
    expect(ProblemDetailsSchema.parse(body)).toEqual(body);
  });

  it("rejects non-error status codes", () => {
    expect(
      ProblemDetailsSchema.safeParse({ type: "about:blank", title: "OK", status: 200, code: "x" })
        .success,
    ).toBe(false);
  });
});

describe("HealthResponseSchema", () => {
  it("requires an ISO timestamp", () => {
    const base = {
      status: "ok",
      service: "seo-geo-api",
      version: "0.0.0",
      mode: "api",
      deploymentMode: "selfhost",
      uptimeSeconds: 1.5,
    };
    expect(
      HealthResponseSchema.safeParse({ ...base, timestamp: new Date().toISOString() }).success,
    ).toBe(true);
    expect(HealthResponseSchema.safeParse({ ...base, timestamp: "yesterday" }).success).toBe(false);
  });
});
