import { hostMatchesDomain, registrableDomain, tryNormalizeHostname } from "../domain.js";
import { normalizeUrl } from "../audit/url.js";

/** A brand whose domains citations are attributed to. */
export interface BrandDomains {
  id: string;
  domains: readonly string[];
  /** Whether subdomains of the brand's domains count too. Defaults to `true`. */
  includeSubdomains?: boolean;
}

export interface SourceToAttribute {
  /** Order in the answer's source list; 1 = first. */
  rank: number;
  url: string | null;
  domain: string | null;
  title: string | null;
}

export interface AttributedCitation {
  rank: number;
  url: string | null;
  /** Host of the source, e.g. `blog.example.com`. */
  host: string;
  /** Registrable domain (Public Suffix List), e.g. `example.com`. */
  domain: string;
  title: string | null;
  /** The brand whose domains the source belongs to, if any. */
  entityId: string | null;
}

function hostOf(source: SourceToAttribute): string | null {
  if (source.url) {
    try {
      const host = tryNormalizeHostname(new URL(source.url).hostname);
      if (host) return host;
    } catch {
      // Fall back to the reported domain.
    }
  }
  return source.domain ? tryNormalizeHostname(source.domain) : null;
}

/**
 * Attributes an answer's sources to tracked brands by exact domain comparison (a source on
 * `notexample.com` never counts for `example.com`). Sources without a usable host are left
 * out. The first brand listing a matching domain wins.
 */
export function attributeCitations(
  sources: readonly SourceToAttribute[],
  brands: readonly BrandDomains[],
): AttributedCitation[] {
  const citations: AttributedCitation[] = [];
  for (const source of sources) {
    const host = hostOf(source);
    if (!host) continue;
    const brand = brands.find((candidate) =>
      candidate.domains.some((domain) =>
        hostMatchesDomain(host, domain, { includeSubdomains: candidate.includeSubdomains ?? true }),
      ),
    );
    citations.push({
      rank: source.rank,
      url: source.url,
      host,
      domain: registrableDomain(host) ?? host,
      title: source.title,
      entityId: brand?.id ?? null,
    });
  }
  return citations;
}

/**
 * The project page a cited URL points to, among the pages the project knows (from site
 * audits and Search Console), compared after URL normalization and with or without a
 * trailing slash. `null` when there is no match: a citation is never attached to the home
 * page by default.
 */
export function matchKnownPage(url: string | null, knownPages: ReadonlySet<string>): string | null {
  if (!url) return null;
  const normalized = normalizeUrl(url);
  if (!normalized) return null;
  if (knownPages.has(normalized)) return normalized;
  const parsed = new URL(normalized);
  if (parsed.pathname.length > 1) {
    parsed.pathname = parsed.pathname.endsWith("/")
      ? parsed.pathname.slice(0, -1)
      : `${parsed.pathname}/`;
    const variant = parsed.href;
    if (knownPages.has(variant)) return variant;
  }
  return null;
}
