import { randomUUID } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

// Accept an upstream request ID only when it is short and safe to log.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

const requestIds = new WeakMap<Request, string>();

export function getRequestId(request: Request): string | undefined {
  return requestIds.get(request);
}

/** Express middleware: reuse a safe incoming `X-Request-Id` or create one, echo it back. */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incoming = request.header(REQUEST_ID_HEADER);
  const id = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  requestIds.set(request, id);
  response.setHeader(REQUEST_ID_HEADER, id);
  next();
}
