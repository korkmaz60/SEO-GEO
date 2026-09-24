import type { NextRequest } from "next/server";

/**
 * Forwards /api/* to the NestJS api at request time, so one web image works with any
 * API_URL. The path is kept as is (`/api/v1/...`, `/api/auth/...`); cookies, redirects and
 * streaming bodies pass through unchanged.
 */
export const dynamic = "force-dynamic";

const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

// Hop-by-hop headers (RFC 9110 §7.6.1) and those fetch sets itself.
const SKIP_REQUEST_HEADERS = new Set([
  "connection",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
// fetch has already decoded the body, so its encoding and length no longer apply.
const SKIP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "set-cookie",
  "transfer-encoding",
]);

async function forward(request: NextRequest): Promise<Response> {
  const url = new URL(request.url);
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!SKIP_REQUEST_HEADERS.has(name)) headers.set(name, value);
  });
  headers.set("x-forwarded-host", request.headers.get("host") ?? url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
      cache: "no-store",
      signal: request.signal,
      ...(hasBody ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch {
    return Response.json(
      {
        type: "about:blank",
        title: "Bad Gateway",
        status: 502,
        code: "internal_error",
        detail: "The API is not reachable.",
      },
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!SKIP_RESPONSE_HEADERS.has(name)) responseHeaders.set(name, value);
  });
  for (const cookie of upstream.headers.getSetCookie())
    responseHeaders.append("set-cookie", cookie);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export {
  forward as DELETE,
  forward as GET,
  forward as HEAD,
  forward as OPTIONS,
  forward as PATCH,
  forward as POST,
  forward as PUT,
};
