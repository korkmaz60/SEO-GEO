import { z } from "zod";

/** Stable machine-readable error codes returned in problem+json responses. */
export const ErrorCode = {
  ValidationFailed: "validation_failed",
  Unauthorized: "unauthorized",
  Forbidden: "forbidden",
  NotFound: "not_found",
  Conflict: "conflict",
  RateLimited: "rate_limited",
  BudgetExceeded: "budget_exceeded",
  ProviderError: "provider_error",
  Internal: "internal_error",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const FieldErrorSchema = z.object({
  /** Dot-separated path of the invalid field, e.g. `keywords.3.text`. */
  path: z.string(),
  message: z.string(),
  code: z.string().optional(),
});
export type FieldError = z.infer<typeof FieldErrorSchema>;

/** RFC 9457 problem details, extended with `code`, `errors` and `requestId`. */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  instance: z.string().optional(),
  code: z.string(),
  errors: z.array(FieldErrorSchema).optional(),
  requestId: z.string().optional(),
});
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;

export const PROBLEM_CONTENT_TYPE = "application/problem+json";
