import { hostMatchesDomain } from "../domain.js";

/** The parts of a parsed SERP that attribution needs (see `@seo-geo/dataforseo`). */
export interface SerpLinkLike {
  domain: string | null;
  url: string | null;
}

export interface SerpLike {
  itemTypes: readonly string[];
  organic: readonly (SerpLinkLike & { rankGroup: number; rankAbsolute: number })[];
  features: readonly { type: string; links: readonly SerpLinkLike[] }[];
  aiOverview: { references: readonly SerpLinkLike[] } | null;
}

/** Domains that count as one site or brand. */
export type DomainTarget = readonly { domain: string; includeSubdomains: boolean }[];

export interface CompetitorTarget {
  id: string;
  target: DomainTarget;
}

export interface RankSummary {
  /** Best organic position (1 = first organic result), or `null` when not found. */
  position: number | null;
  rankAbsolute: number | null;
  url: string | null;
  /** Element types present in the SERP. */
  serpFeatures: string[];
  /** SERP features (other than organic results and ads) that link to the target. */
  ownedFeatures: string[];
  aiOverviewPresent: boolean;
  aiOverviewCited: boolean;
  /** Target pages the AI Overview cites. */
  aiOverviewCitedUrls: string[];
}

export interface CompetitorRank {
  position: number;
  url: string | null;
}

/** Element types that are never counted as owned features. */
const NOT_OWNABLE = new Set(["organic", "paid", "related_searches", "people_also_search"]);

function linkHost(link: SerpLinkLike): string | null {
  return link.url ?? link.domain;
}

/** Exact host attribution (never substring matching), see `hostMatchesDomain`. */
export function linkMatches(link: SerpLinkLike, target: DomainTarget): boolean {
  const host = linkHost(link);
  if (!host) return false;
  return target.some((entry) =>
    hostMatchesDomain(host, entry.domain, { includeSubdomains: entry.includeSubdomains }),
  );
}

function bestOrganic(serp: SerpLike, target: DomainTarget) {
  let best: SerpLike["organic"][number] | null = null;
  for (const result of serp.organic) {
    if (linkMatches(result, target) && (best === null || result.rankGroup < best.rankGroup)) {
      best = result;
    }
  }
  return best;
}

/** Where a site appears in a SERP: organic position, owned features and AI Overview citations. */
export function summarizeSerp(serp: SerpLike, target: DomainTarget): RankSummary {
  const best = bestOrganic(serp, target);
  const owned = new Set<string>();
  for (const feature of serp.features) {
    if (NOT_OWNABLE.has(feature.type)) continue;
    if (feature.links.some((link) => linkMatches(link, target))) owned.add(feature.type);
  }
  const cited = (serp.aiOverview?.references ?? []).filter((reference) =>
    linkMatches(reference, target),
  );
  return {
    position: best?.rankGroup ?? null,
    rankAbsolute: best?.rankAbsolute ?? null,
    url: best?.url ?? null,
    serpFeatures: [...new Set(serp.itemTypes)],
    ownedFeatures: [...owned],
    aiOverviewPresent: serp.aiOverview !== null || serp.itemTypes.includes("ai_overview"),
    aiOverviewCited: cited.length > 0,
    aiOverviewCitedUrls: [
      ...new Set(cited.flatMap((reference) => (reference.url ? [reference.url] : []))),
    ],
  };
}

/** Best organic position of each competitor that ranks. */
export function competitorRanks(
  serp: SerpLike,
  competitors: readonly CompetitorTarget[],
): Record<string, CompetitorRank> {
  const ranks: Record<string, CompetitorRank> = {};
  for (const competitor of competitors) {
    const best = bestOrganic(serp, competitor.target);
    if (best) ranks[competitor.id] = { position: best.rankGroup, url: best.url };
  }
  return ranks;
}
