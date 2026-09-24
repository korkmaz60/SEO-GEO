import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import { isPublicIpAddress, stripBrackets } from "./ip.js";

export type UnsafeUrlReason =
  | "invalid_url"
  | "unsupported_protocol"
  | "credentials_in_url"
  | "port_not_allowed"
  | "private_address"
  | "unresolvable_host";

export class UnsafeUrlError extends Error {
  constructor(
    readonly reason: UnsafeUrlReason,
    message: string,
  ) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export interface UrlPolicyOptions {
  /** Ports that may be requested. Defaults to 80 and 443. */
  allowedPorts?: readonly number[];
}

export const DEFAULT_ALLOWED_PORTS: readonly number[] = [80, 443];

/**
 * Checks that need no DNS: http(s) only, no credentials, an allowed port, and no literal
 * non-public IP address. Returns the parsed URL.
 */
export function assertAllowedUrl(input: string | URL, options: UrlPolicyOptions = {}): URL {
  let url: URL;
  try {
    url = new URL(typeof input === "string" ? input : input.href);
  } catch {
    throw new UnsafeUrlError("invalid_url", "The URL could not be parsed");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("unsupported_protocol", `Protocol ${url.protocol} is not allowed`);
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("credentials_in_url", "URLs with credentials are not allowed");
  }

  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!(options.allowedPorts ?? DEFAULT_ALLOWED_PORTS).includes(port)) {
    throw new UnsafeUrlError("port_not_allowed", `Port ${port} is not allowed`);
  }

  const host = stripBrackets(url.hostname);
  if (isIP(host) !== 0 && !isPublicIpAddress(host)) {
    throw new UnsafeUrlError("private_address", `${host} is not a public address`);
  }
  return url;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type LookupFunction = (hostname: string) => Promise<ResolvedAddress[]>;

const systemLookup: LookupFunction = (hostname) =>
  dnsLookup(hostname, { all: true, order: "verbatim" });

/**
 * Resolves a hostname and returns its addresses. Throws when the name does not resolve or
 * when **any** resolved address is not public, so a name with one private record cannot
 * be used to reach internal services.
 *
 * The HTTP client must connect to one of the returned addresses (not resolve the name
 * again) so the answer cannot change between the check and the connection.
 */
export async function resolvePublicAddresses(
  hostname: string,
  lookup: LookupFunction = systemLookup,
): Promise<ResolvedAddress[]> {
  const host = stripBrackets(hostname);
  const family = isIP(host);
  if (family !== 0) {
    if (!isPublicIpAddress(host)) {
      throw new UnsafeUrlError("private_address", `${host} is not a public address`);
    }
    return [{ address: host, family }];
  }

  let records: ResolvedAddress[];
  try {
    records = await lookup(host);
  } catch {
    throw new UnsafeUrlError("unresolvable_host", `${host} could not be resolved`);
  }
  if (records.length === 0) {
    throw new UnsafeUrlError("unresolvable_host", `${host} could not be resolved`);
  }
  if (records.some((record) => !isPublicIpAddress(record.address))) {
    throw new UnsafeUrlError("private_address", `${host} resolves to a non-public address`);
  }
  return records;
}

export interface PublicUrlCheckOptions extends UrlPolicyOptions {
  lookup?: LookupFunction;
}

/** Full pre-flight check for a URL that the server is about to fetch. */
export async function assertPublicUrl(
  input: string | URL,
  options: PublicUrlCheckOptions = {},
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
  const url = assertAllowedUrl(input, options);
  const addresses = await resolvePublicAddresses(url.hostname, options.lookup);
  return { url, addresses };
}
