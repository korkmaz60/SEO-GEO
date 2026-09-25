const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/**
 * The host a domain analysis is about, as the api computes it (`@seo-geo/core`
 * `normalizeHostname` without `www.`): `https://www.Example.com/path` → `example.com`.
 * `null` for anything that is not a public hostname; the api has the final say.
 */
export function analyzedHost(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `http://${trimmed}`);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  const labels = host.split(".");
  if (
    host.length > 253 ||
    labels.length < 2 ||
    !labels.every((label) => LABEL.test(label)) ||
    !/[a-z]/.test(labels.at(-1) ?? "")
  ) {
    return null;
  }
  return host.startsWith("www.") ? host.slice(4) : host;
}
