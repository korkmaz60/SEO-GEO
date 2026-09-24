import { getDomain } from "tldts";

export class InvalidHostnameError extends Error {
  constructor(input: string) {
    super(`Not a valid hostname: "${input}"`);
    this.name = "InvalidHostnameError";
  }
}

const HOSTNAME_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * A public DNS hostname: at least two labels, a TLD containing a letter (so IP literals
 * are rejected), labels of 1–63 letters, digits or hyphens.
 */
export function isValidHostname(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  const labels = host.split(".");
  if (labels.length < 2 || !labels.every((label) => HOSTNAME_LABEL.test(label))) return false;
  return /[a-z]/.test(labels.at(-1) ?? "");
}

/**
 * Normalizes user input such as `https://www.Example.com/path` or `Example.COM.` to a
 * lowercase ASCII hostname (`www.example.com`, `example.com`). Unicode names are converted
 * to punycode. Throws {@link InvalidHostnameError} for anything that is not a public hostname.
 */
export function normalizeHostname(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new InvalidHostnameError(input);

  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    throw new InvalidHostnameError(input);
  }
  if (url.username || url.password) throw new InvalidHostnameError(input);

  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!isValidHostname(host)) throw new InvalidHostnameError(input);
  return host;
}

/** Like {@link normalizeHostname} but returns `null` instead of throwing. */
export function tryNormalizeHostname(input: string): string | null {
  try {
    return normalizeHostname(input);
  } catch {
    return null;
  }
}

export function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * The registrable domain ("eTLD+1") according to the Public Suffix List, including its
 * private section: `blog.example.co.uk` → `example.co.uk`, `docs.acme.github.io` →
 * `acme.github.io`.
 */
export function registrableDomain(hostOrUrl: string): string | null {
  const host = tryNormalizeHostname(hostOrUrl);
  if (!host) return null;
  return getDomain(host, { allowPrivateDomains: true }) ?? null;
}

export interface DomainMatchOptions {
  /** Also match subdomains of `domain` (e.g. `blog.example.com` for `example.com`). */
  includeSubdomains?: boolean;
}

/**
 * Exact hostname comparison for attribution. Never substring matching: `notexample.com`
 * and `example.com.evil.net` do not match `example.com`. A leading `www.` is ignored on both
 * sides.
 */
export function hostMatchesDomain(
  hostOrUrl: string,
  domain: string,
  options: DomainMatchOptions = {},
): boolean {
  const host = tryNormalizeHostname(hostOrUrl);
  const target = tryNormalizeHostname(domain);
  if (!host || !target) return false;

  const h = stripWww(host);
  const d = stripWww(target);
  if (h === d) return true;
  return options.includeSubdomains === true && h.endsWith(`.${d}`);
}
