import type { LookupAddress, LookupOptions } from "node:dns";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

import { Agent, errors as undiciErrors, request, type Dispatcher } from "undici";

import { isPublicIpAddress } from "./ip.js";
import {
  UnsafeUrlError,
  assertAllowedUrl,
  resolvePublicAddresses,
  type LookupFunction,
  type UnsafeUrlReason,
} from "./url-policy.js";

export type SafeFetchFailure =
  UnsafeUrlReason | "too_many_redirects" | "timeout" | "too_large" | "content_type" | "network";

/** Why a safe fetch failed; policy refusals keep the reason of the URL check. */
export class SafeFetchError extends Error {
  constructor(
    readonly reason: SafeFetchFailure,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "SafeFetchError";
  }
}

export interface SafeFetcherConfig {
  /** Ports that may be requested. Defaults to 80 and 443. */
  allowedPorts?: readonly number[];
  /** Resolves host names; defaults to the system resolver. */
  lookup?: LookupFunction;
  /**
   * Which resolved addresses may be contacted. Defaults to globally routable unicast
   * addresses only; loosen it only for tests or a deliberate operator setting.
   */
  isAllowedAddress?: (address: string) => boolean;
  /** Sent as `User-Agent` unless a request overrides it. */
  userAgent?: string;
  /** Time to establish a connection (including TLS). Defaults to 10 s. */
  connectTimeoutMs?: number;
  /** Open connections per origin. Defaults to 4. */
  connectionsPerOrigin?: number;
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Redirects to follow; every hop is checked again. Defaults to 5. */
  maxRedirects?: number;
  /** Total time for all hops, headers and body. Defaults to 20 s. */
  timeoutMs?: number;
  /** Largest decoded body that is read. Defaults to 5 MiB. */
  maxBytes?: number;
  /**
   * Accepted media types, e.g. `["text/html", "application/xhtml+xml"]`; a trailing
   * `/*` matches a whole type. Any type is accepted when omitted.
   */
  accept?: readonly string[];
  signal?: AbortSignal;
}

export interface SafeResponse {
  /** The final URL after redirects. */
  url: string;
  status: number;
  headers: Record<string, string>;
  /** Media type without parameters, lower case. */
  contentType: string | null;
  /** URLs that answered with a redirect, in order. */
  redirects: string[];
  /** The decoded (decompressed) body; empty for HEAD. */
  body: Buffer;
  /** The body as text, using the charset from `Content-Type` (UTF-8 by default). */
  text(): string;
}

export interface SafeFetcher {
  fetch(url: string | URL, options?: SafeFetchOptions): Promise<SafeResponse>;
  close(): Promise<void>;
}

const DEFAULTS = {
  maxRedirects: 5,
  timeoutMs: 20_000,
  maxBytes: 5 * 1024 * 1024,
  connectTimeoutMs: 10_000,
  connectionsPerOrigin: 4,
};

export const DEFAULT_USER_AGENT = "SEO-GEO-Bot/1.0 (+https://github.com/korkmaz60/SEO-GEO)";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/** Never sent along to another origin after a redirect. */
const CREDENTIAL_HEADERS = ["authorization", "cookie", "proxy-authorization"];

/**
 * An HTTP client for URLs that users influence (crawler, sitemaps, `robots.txt`,
 * `llms.txt`, webhooks). Host names are resolved and checked when the connection is
 * opened, and the socket connects to exactly the checked address, so DNS rebinding cannot
 * swap in an internal address between check and use. Redirects are followed by hand and
 * each hop passes the same checks; bodies, time and media types are bounded.
 *
 * Keep one fetcher per process (it pools connections) and `close()` it on shutdown.
 */
export function createSafeFetcher(config: SafeFetcherConfig = {}): SafeFetcher {
  const isAllowedAddress = config.isAllowedAddress ?? isPublicIpAddress;
  const userAgent = config.userAgent ?? DEFAULT_USER_AGENT;

  // Called by the socket for every new connection to a host name (IP literals are
  // checked before the request, see `assertAllowedUrl`).
  const lookup = (
    hostname: string,
    options: LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ): void => {
    resolvePublicAddresses(hostname, config.lookup, isAllowedAddress).then(
      (addresses) => {
        const wanted =
          options.family === 4 || options.family === 6
            ? addresses.filter((address) => address.family === options.family)
            : addresses;
        const [first] = wanted;
        if (!first) {
          callback(
            new UnsafeUrlError("unresolvable_host", `${hostname} has no usable address`),
            "",
          );
        } else if (options.all) {
          callback(null, wanted);
        } else {
          callback(null, first.address, first.family);
        }
      },
      (error: unknown) => callback(error as NodeJS.ErrnoException, ""),
    );
  };

  const agent = new Agent({
    connect: { lookup, timeout: config.connectTimeoutMs ?? DEFAULTS.connectTimeoutMs },
    connections: config.connectionsPerOrigin ?? DEFAULTS.connectionsPerOrigin,
    // No HTTP/2 or pipelining surprises: one request per connection at a time.
    pipelining: 1,
  });

  async function fetchUrl(
    input: string | URL,
    options: SafeFetchOptions = {},
  ): Promise<SafeResponse> {
    const maxRedirects = options.maxRedirects ?? DEFAULTS.maxRedirects;
    const maxBytes = options.maxBytes ?? DEFAULTS.maxBytes;
    const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULTS.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    const method = options.method ?? "GET";
    let headers: Record<string, string> = {
      "user-agent": userAgent,
      "accept-encoding": "gzip, deflate, br",
      ...lowerCaseKeys(options.headers ?? {}),
    };

    const redirects: string[] = [];
    let url = checkUrl(input, config);
    for (;;) {
      let response: Dispatcher.ResponseData;
      try {
        response = await request(url, {
          method,
          headers,
          dispatcher: agent,
          signal,
          headersTimeout: options.timeoutMs ?? DEFAULTS.timeoutMs,
          bodyTimeout: options.timeoutMs ?? DEFAULTS.timeoutMs,
        });
      } catch (error) {
        throw toSafeFetchError(error, timeout, url);
      }

      const location = header(response.headers, "location");
      if (REDIRECT_STATUSES.has(response.statusCode) && location) {
        await discard(response.body);
        if (redirects.length >= maxRedirects) {
          throw new SafeFetchError("too_many_redirects", `More than ${maxRedirects} redirects`);
        }
        redirects.push(url.href);
        const next = checkUrl(new URL(location, url), config);
        if (next.origin !== url.origin) headers = withoutCredentials(headers);
        url = next;
        continue;
      }

      const contentType = mediaType(header(response.headers, "content-type"));
      if (options.accept && !acceptsMediaType(options.accept, contentType)) {
        await discard(response.body);
        throw new SafeFetchError(
          "content_type",
          `${contentType ?? "A missing content type"} is not accepted`,
        );
      }
      const declaredLength = Number(header(response.headers, "content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await discard(response.body);
        throw new SafeFetchError("too_large", `The response is larger than ${maxBytes} bytes`);
      }

      let body: Buffer;
      try {
        body =
          method === "HEAD"
            ? Buffer.alloc(0)
            : await readBody(response.body, header(response.headers, "content-encoding"), maxBytes);
      } catch (error) {
        throw toSafeFetchError(error, timeout, url);
      }
      const charset = charsetOf(header(response.headers, "content-type"));
      return {
        url: url.href,
        status: response.statusCode,
        headers: flattenHeaders(response.headers),
        contentType,
        redirects,
        body,
        text: () => decodeText(body, charset),
      };
    }
  }

  return { fetch: fetchUrl, close: () => agent.close() };
}

function checkUrl(input: string | URL, config: SafeFetcherConfig): URL {
  try {
    return assertAllowedUrl(input, {
      allowedPorts: config.allowedPorts,
      isAllowedAddress: config.isAllowedAddress,
    });
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      throw new SafeFetchError(error.reason, error.message, { cause: error });
    }
    throw error;
  }
}

/** Reads and decompresses a body, stopping as soon as the decoded size passes the limit. */
async function readBody(
  body: Readable,
  contentEncoding: string | undefined,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;
  const collect = async (source: AsyncIterable<Buffer>) => {
    for await (const chunk of source) {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        throw new Error("too large");
      }
      chunks.push(chunk);
    }
  };
  const encoding = contentEncoding?.trim().toLowerCase();
  try {
    if (encoding === "gzip" || encoding === "x-gzip") await pipeline(body, createGunzip(), collect);
    else if (encoding === "deflate") await pipeline(body, createInflate(), collect);
    else if (encoding === "br") await pipeline(body, createBrotliDecompress(), collect);
    else await pipeline(body, collect);
  } catch (error) {
    // Stopping early destroys the streams, which can surface as an abort instead.
    if (tooLarge) {
      throw new SafeFetchError("too_large", `The response is larger than ${maxBytes} bytes`);
    }
    throw error;
  }
  return Buffer.concat(chunks, size);
}

/** Drops a body we do not read; undici closes the connection if much is left. */
async function discard(body: Dispatcher.ResponseData["body"]): Promise<void> {
  await body.dump({ limit: 64 * 1024 }).catch(() => undefined);
}

function toSafeFetchError(error: unknown, timeout: AbortSignal, url: URL): SafeFetchError {
  if (error instanceof SafeFetchError) return error;
  if (
    timeout.aborted ||
    error instanceof undiciErrors.HeadersTimeoutError ||
    error instanceof undiciErrors.BodyTimeoutError ||
    error instanceof undiciErrors.ConnectTimeoutError
  ) {
    return new SafeFetchError("timeout", `${url.origin} did not answer in time`, { cause: error });
  }
  // The connection-time address check fails inside the socket's lookup.
  const policy = findCause(error, (cause) => cause instanceof UnsafeUrlError);
  if (policy instanceof UnsafeUrlError) {
    return new SafeFetchError(policy.reason, policy.message, { cause: error });
  }
  return new SafeFetchError("network", `${url.origin} could not be reached`, { cause: error });
}

function findCause(error: unknown, match: (cause: unknown) => boolean): unknown {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    if (match(current)) return current;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

type RawHeaders = Record<string, string | string[] | undefined>;

function header(headers: RawHeaders, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function flattenHeaders(headers: RawHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).flatMap(([name, value]) =>
      value === undefined ? [] : [[name, Array.isArray(value) ? value.join(", ") : value]],
    ),
  );
}

function lowerCaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
}

function withoutCredentials(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !CREDENTIAL_HEADERS.includes(name)),
  );
}

function mediaType(contentType: string | undefined): string | null {
  const type = contentType?.split(";")[0]?.trim().toLowerCase();
  return type || null;
}

export function acceptsMediaType(accept: readonly string[], contentType: string | null): boolean {
  if (!contentType) return false;
  return accept.some((pattern) => {
    const wanted = pattern.toLowerCase();
    return wanted.endsWith("/*")
      ? contentType.startsWith(wanted.slice(0, -1))
      : contentType === wanted;
  });
}

function charsetOf(contentType: string | undefined): string {
  const match = contentType?.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return match?.[1]?.toLowerCase() ?? "utf-8";
}

function decodeText(body: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}
