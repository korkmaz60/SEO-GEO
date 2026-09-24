/** Query parameters that only track campaigns or clicks; dropped when URLs are compared. */
const TRACKING_PARAMETER =
  /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|yclid|igshid|mc_cid|mc_eid|_ga|_gl|srsltid)$/i;

/**
 * An absolute http(s) URL in the form used for crawling and deduplication: no fragment or
 * credentials, lower-case host without a trailing dot, no default port (the URL parser
 * handles case and ports), tracking parameters removed and the rest sorted. Returns `null`
 * for other schemes (`mailto:`, `javascript:`, `tel:`) and invalid input.
 */
export function normalizeUrl(input: string, base?: string | URL): string | null {
  let url: URL;
  try {
    url = new URL(input.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.username = "";
  url.password = "";
  if (url.hostname.endsWith(".")) url.hostname = url.hostname.slice(0, -1);
  const params = [...url.searchParams]
    .filter(([name]) => !TRACKING_PARAMETER.test(name))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  url.search = params.length > 0 ? new URLSearchParams(params).toString() : "";
  return url.href;
}

/** `https://example.com/a/b?x=1` → `https://example.com`. */
export function originOf(url: string): string {
  return new URL(url).origin;
}
