import { z } from "zod";

import type { DataForSeoClient } from "../client.js";
import { compact, parseResponse, toIsoDateTime } from "./shared.js";

// DataForSEO Backlinks API (Live). Field names follow the official DataForSEO client
// (dataforseo-client 2.1.7: BacklinksSummaryLiveRequestInfo, BacklinksSummaryLiveResultInfo,
// BacklinksHistoryLiveRequestInfo, BacklinksHistoryLiveItem,
// BacklinksTimeseriesNewLostSummaryLiveRequestInfo, BacklinksTimeseriesNewLostSummaryLiveItem,
// BacklinksReferringDomainsLiveRequestInfo, BacklinksReferringDomainsLiveItem,
// BacklinksBacklinksLiveRequestInfo, BacklinksBacklinksLiveItem,
// BacklinksAnchorsLiveRequestInfo, BacklinksAnchorsLiveItem,
// BacklinksDomainIntersectionLiveRequestInfo, BacklinksDomainIntersectionLiveItem,
// BacklinksDomainIntersection, IntersectionSummaryInfo).

const BASE = "/backlinks";
export const BACKLINKS_SUMMARY_PATH = `${BASE}/summary/live`;
export const BACKLINKS_HISTORY_PATH = `${BASE}/history/live`;
export const BACKLINKS_NEW_LOST_PATH = `${BASE}/timeseries_new_lost_summary/live`;
export const BACKLINKS_REFERRING_DOMAINS_PATH = `${BASE}/referring_domains/live`;
export const BACKLINKS_BACKLINKS_PATH = `${BASE}/backlinks/live`;
export const BACKLINKS_ANCHORS_PATH = `${BASE}/anchors/live`;
export const BACKLINKS_DOMAIN_INTERSECTION_PATH = `${BASE}/domain_intersection/live`;

/** Limits of the Backlinks API per request. */
export const BACKLINKS_LIMITS = {
  /** Rows a list endpoint returns at most. */
  rows: 1000,
  /** Targets of a domain intersection. */
  intersectionTargets: 20,
  /** Excluded targets of a domain intersection. */
  intersectionExcludes: 10,
} as const;

/** Ranks are requested on DataForSEO's 0–100 scale, which reads like other SEO tools'. */
const RANK_SCALE = "one_hundred";

export interface BacklinksTarget {
  /** A domain, subdomain or page URL. */
  target: string;
  /** Count links to subdomains of a domain too (DataForSEO's default). */
  includeSubdomains?: boolean;
}

export interface BacklinksListRequest extends BacklinksTarget {
  /** Rows to return, at most {@link BACKLINKS_LIMITS.rows}. */
  limit: number;
}

/** The backlink profile of a target, normalized. */
export interface BacklinksSummary {
  target: string;
  /** DataForSEO rank, 0–100: the weight of the links, like PageRank. */
  rank: number | null;
  backlinks: number;
  referringDomains: number;
  referringDomainsNofollow: number;
  /** Registrable domains (`blog.example.com` counts as `example.com`). */
  referringMainDomains: number;
  referringIps: number;
  referringSubnets: number;
  referringPages: number;
  brokenBacklinks: number;
  brokenPages: number;
  /** Average spam score of the backlinks, 0–100. */
  spamScore: number | null;
  /** When DataForSEO first saw a link to the target (ISO 8601). */
  firstSeen: string | null;
  crawledPages: number;
}

/** A target's backlinks as of the first day of a month. */
export interface BacklinksHistoryMonth {
  /** The first day of the month (YYYY-MM-DD). */
  date: string;
  rank: number | null;
  backlinks: number;
  referringDomains: number;
  referringMainDomains: number;
  /** Compared with the month before; DataForSEO has these from May 2021 on. */
  newBacklinks: number;
  lostBacklinks: number;
  newReferringDomains: number;
  lostReferringDomains: number;
}

/** Links a target gained and lost in one period of a new and lost series. */
export interface NewLostPeriod {
  /** The day, or the last day of the week, month or year (YYYY-MM-DD). */
  date: string;
  newBacklinks: number;
  lostBacklinks: number;
  newReferringDomains: number;
  lostReferringDomains: number;
  newReferringMainDomains: number;
  lostReferringMainDomains: number;
}

export type NewLostGroupRange = "day" | "week" | "month" | "year";

/** A domain that links to the target. */
export interface ReferringDomain {
  domain: string;
  /** Rank the domain passes to the target, 0–100. */
  rank: number | null;
  /** Backlinks from this domain to the target. */
  backlinks: number;
  referringPages: number;
  brokenBacklinks: number;
  /** Average spam score of its backlinks, 0–100. */
  spamScore: number | null;
  /** When DataForSEO first saw a link from this domain (ISO 8601). */
  firstSeen: string | null;
  /** When its last link was lost; `null` while it still links. */
  lostDate: string | null;
}

/** How backlinks are grouped: all of them, or one per referring domain or anchor. */
export type BacklinksMode = "as_is" | "one_per_domain" | "one_per_anchor";

/** One link to the target. */
export interface Backlink {
  domainFrom: string;
  urlFrom: string;
  /** Title of the linking page. */
  pageTitle: string | null;
  urlTo: string;
  anchor: string | null;
  /** `anchor`, `image`, `link`, `meta`, `canonical`, `alternate` or `redirect`. */
  type: string | null;
  dofollow: boolean;
  /** Rank the link passes to the target, 0–100. */
  rank: number | null;
  /** Rank of the linking domain, 0–100. */
  domainFromRank: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Found on the linking page at DataForSEO's latest visit and not before. */
  isNew: boolean;
  isLost: boolean;
  /** Points to a page that answers with a 4xx or 5xx status. */
  isBroken: boolean;
  /** Links from the same domain, when grouped one per domain. */
  groupCount: number | null;
}

/** An anchor text of the links to the target. */
export interface BacklinksAnchor {
  /** The text; empty for links without text, such as images. */
  anchor: string;
  /** Rank passed to the target through links with this anchor, 0–100. */
  rank: number | null;
  backlinks: number;
  referringDomains: number;
  /** Referring domains with at least one nofollow link with this anchor. */
  referringDomainsNofollow: number;
  firstSeen: string | null;
  lostDate: string | null;
}

/** What a domain links to one target of a domain intersection with. */
export interface IntersectionLinks {
  /** Rank the domain passes to that target, 0–100. */
  rank: number | null;
  backlinks: number;
  firstSeen: string | null;
}

/** A domain that links to the targets of a domain intersection. */
export interface IntersectingDomain {
  domain: string;
  /** Its links to each target, in the order of the targets; `null` where it has none. */
  links: (IntersectionLinks | null)[];
  /** How many of the targets it links to. */
  intersections: number;
}

// ── Response schemas ────────────────────────────────────────────────────────────────

const count = z.number().nullish();
const text = z.string().nullish();

const SummarySchema = z.looseObject({
  target: text,
  rank: count,
  backlinks: count,
  backlinks_spam_score: count,
  crawled_pages: count,
  first_seen: text,
  broken_backlinks: count,
  broken_pages: count,
  referring_domains: count,
  referring_domains_nofollow: count,
  referring_main_domains: count,
  referring_ips: count,
  referring_subnets: count,
  referring_pages: count,
});

const HistoryResultSchema = z.looseObject({
  items: z
    .array(
      z.looseObject({
        date: text,
        rank: count,
        backlinks: count,
        new_backlinks: count,
        lost_backlinks: count,
        new_referring_domains: count,
        lost_referring_domains: count,
        referring_domains: count,
        referring_main_domains: count,
      }),
    )
    .nullish(),
});

const NewLostResultSchema = z.looseObject({
  items: z
    .array(
      z.looseObject({
        date: text,
        new_backlinks: count,
        lost_backlinks: count,
        new_referring_domains: count,
        lost_referring_domains: count,
        new_referring_main_domains: count,
        lost_referring_main_domains: count,
      }),
    )
    .nullish(),
});

const ReferringDomainsResultSchema = z.looseObject({
  total_count: count,
  items: z
    .array(
      z.looseObject({
        domain: text,
        rank: count,
        backlinks: count,
        first_seen: text,
        lost_date: text,
        backlinks_spam_score: count,
        broken_backlinks: count,
        referring_pages: count,
      }),
    )
    .nullish(),
});

const BacklinksResultSchema = z.looseObject({
  total_count: count,
  items: z
    .array(
      z.looseObject({
        domain_from: text,
        url_from: text,
        url_to: text,
        page_from_title: text,
        anchor: text,
        item_type: text,
        dofollow: z.boolean().nullish(),
        rank: count,
        domain_from_rank: count,
        first_seen: text,
        last_seen: text,
        is_new: z.boolean().nullish(),
        is_lost: z.boolean().nullish(),
        is_broken: z.boolean().nullish(),
        group_count: count,
      }),
    )
    .nullish(),
});

const AnchorsResultSchema = z.looseObject({
  total_count: count,
  items: z
    .array(
      z.looseObject({
        anchor: text,
        rank: count,
        backlinks: count,
        first_seen: text,
        lost_date: text,
        referring_domains: count,
        referring_domains_nofollow: count,
      }),
    )
    .nullish(),
});

const IntersectionEntrySchema = z.looseObject({
  target: text,
  rank: count,
  backlinks: count,
  first_seen: text,
});

const DomainIntersectionResultSchema = z.looseObject({
  total_count: count,
  items: z
    .array(
      z.looseObject({
        domain_intersection: z.record(z.string(), IntersectionEntrySchema.nullish()).nullish(),
        summary: z.looseObject({ intersections_count: count }).nullish(),
      }),
    )
    .nullish(),
});

/** Counts are whole numbers; DataForSEO leaves some out when they are zero. */
function whole(value: number | null | undefined): number {
  return Math.round(value ?? 0);
}

/** The calendar day (YYYY-MM-DD, UTC) of a DataForSEO timestamp. */
function toIsoDate(value: string | null | undefined): string | null {
  return toIsoDateTime(value)?.slice(0, 10) ?? null;
}

/** Parameters every list endpoint gets: live links, no internal ones, ranks on 0–100. */
function listBody(input: BacklinksListRequest) {
  return {
    target: input.target,
    include_subdomains: input.includeSubdomains ?? true,
    backlinks_status_type: "live",
    exclude_internal_backlinks: true,
    rank_scale: RANK_SCALE,
    limit: input.limit,
  };
}

// ── Endpoints ───────────────────────────────────────────────────────────────────────

/** The backlink profile of a domain, subdomain or page. */
export async function getBacklinksSummary(
  client: DataForSeoClient,
  input: BacklinksTarget,
): Promise<{ summary: BacklinksSummary | null; cost: number }> {
  const path = BACKLINKS_SUMMARY_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    target: input.target,
    include_subdomains: input.includeSubdomains ?? true,
    backlinks_status_type: "live",
    rank_scale: RANK_SCALE,
    internal_list_limit: 10,
  });
  const data = result[0] ? parseResponse(SummarySchema, result[0], path) : null;
  if (!data) return { summary: null, cost };
  return {
    summary: {
      target: data.target ?? input.target,
      rank: data.rank ?? null,
      backlinks: whole(data.backlinks),
      referringDomains: whole(data.referring_domains),
      referringDomainsNofollow: whole(data.referring_domains_nofollow),
      referringMainDomains: whole(data.referring_main_domains),
      referringIps: whole(data.referring_ips),
      referringSubnets: whole(data.referring_subnets),
      referringPages: whole(data.referring_pages),
      brokenBacklinks: whole(data.broken_backlinks),
      brokenPages: whole(data.broken_pages),
      spamScore: data.backlinks_spam_score ?? null,
      firstSeen: toIsoDateTime(data.first_seen),
      crawledPages: whole(data.crawled_pages),
    },
    cost,
  };
}

/**
 * A domain's backlinks month by month since `dateFrom` (YYYY-MM-DD), oldest first. Each month
 * counts the links the domain had on its first day.
 */
export async function getBacklinksHistory(
  client: DataForSeoClient,
  input: { target: string; dateFrom?: string; dateTo?: string },
): Promise<{ months: BacklinksHistoryMonth[]; cost: number }> {
  const path = BACKLINKS_HISTORY_PATH;
  const { result, cost } = await client.postOne<unknown>(
    path,
    compact({
      target: input.target,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      rank_scale: RANK_SCALE,
    }),
  );
  const data = result[0] ? parseResponse(HistoryResultSchema, result[0], path) : null;
  const months = (data?.items ?? [])
    .flatMap((item) => {
      const date = toIsoDate(item.date);
      if (!date) return [];
      return [
        {
          date,
          rank: item.rank ?? null,
          backlinks: whole(item.backlinks),
          referringDomains: whole(item.referring_domains),
          referringMainDomains: whole(item.referring_main_domains),
          newBacklinks: whole(item.new_backlinks),
          lostBacklinks: whole(item.lost_backlinks),
          newReferringDomains: whole(item.new_referring_domains),
          lostReferringDomains: whole(item.lost_referring_domains),
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { months, cost };
}

/**
 * New and lost backlinks and referring domains of a domain from `dateFrom` to `dateTo`
 * (YYYY-MM-DD, today by default) by day, week, month or year, oldest first. Periods without
 * changes are reported with zeros.
 */
export async function getBacklinksNewLostTimeseries(
  client: DataForSeoClient,
  input: BacklinksTarget & { dateFrom: string; dateTo?: string; groupRange?: NewLostGroupRange },
): Promise<{ periods: NewLostPeriod[]; cost: number }> {
  const path = BACKLINKS_NEW_LOST_PATH;
  const { result, cost } = await client.postOne<unknown>(
    path,
    compact({
      target: input.target,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      group_range: input.groupRange ?? "day",
      include_subdomains: input.includeSubdomains ?? true,
    }),
  );
  const data = result[0] ? parseResponse(NewLostResultSchema, result[0], path) : null;
  const periods = (data?.items ?? [])
    .flatMap((item) => {
      const date = toIsoDate(item.date);
      if (!date) return [];
      return [
        {
          date,
          newBacklinks: whole(item.new_backlinks),
          lostBacklinks: whole(item.lost_backlinks),
          newReferringDomains: whole(item.new_referring_domains),
          lostReferringDomains: whole(item.lost_referring_domains),
          newReferringMainDomains: whole(item.new_referring_main_domains),
          lostReferringMainDomains: whole(item.lost_referring_main_domains),
        },
      ];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { periods, cost };
}

/** Domains that link to the target, the ones passing the most rank first. */
export async function getReferringDomains(
  client: DataForSeoClient,
  input: BacklinksListRequest,
): Promise<{ totalCount: number; items: ReferringDomain[]; cost: number }> {
  const path = BACKLINKS_REFERRING_DOMAINS_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    ...listBody(input),
    order_by: ["rank,desc"],
  });
  const data = result[0] ? parseResponse(ReferringDomainsResultSchema, result[0], path) : null;
  const items = (data?.items ?? []).flatMap((item) =>
    item.domain
      ? [
          {
            domain: item.domain,
            rank: item.rank ?? null,
            backlinks: whole(item.backlinks),
            referringPages: whole(item.referring_pages),
            brokenBacklinks: whole(item.broken_backlinks),
            spamScore: item.backlinks_spam_score ?? null,
            firstSeen: toIsoDateTime(item.first_seen),
            lostDate: toIsoDateTime(item.lost_date),
          },
        ]
      : [],
  );
  return { totalCount: whole(data?.total_count ?? items.length), items, cost };
}

/** Links to the target, the ones passing the most rank first. */
export async function getBacklinks(
  client: DataForSeoClient,
  input: BacklinksListRequest & { mode?: BacklinksMode },
): Promise<{ totalCount: number; items: Backlink[]; cost: number }> {
  const path = BACKLINKS_BACKLINKS_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    ...listBody(input),
    mode: input.mode ?? "as_is",
    order_by: ["rank,desc"],
  });
  const data = result[0] ? parseResponse(BacklinksResultSchema, result[0], path) : null;
  const items = (data?.items ?? []).flatMap((item) =>
    item.domain_from && item.url_from && item.url_to
      ? [
          {
            domainFrom: item.domain_from,
            urlFrom: item.url_from,
            pageTitle: item.page_from_title?.trim() || null,
            urlTo: item.url_to,
            anchor: item.anchor ?? null,
            type: item.item_type ?? null,
            dofollow: item.dofollow ?? false,
            rank: item.rank ?? null,
            domainFromRank: item.domain_from_rank ?? null,
            firstSeen: toIsoDateTime(item.first_seen),
            lastSeen: toIsoDateTime(item.last_seen),
            isNew: item.is_new ?? false,
            isLost: item.is_lost ?? false,
            isBroken: item.is_broken ?? false,
            groupCount: item.group_count == null ? null : whole(item.group_count),
          },
        ]
      : [],
  );
  return { totalCount: whole(data?.total_count ?? items.length), items, cost };
}

/** Anchor texts of the links to the target, the ones used by most referring domains first. */
export async function getBacklinksAnchors(
  client: DataForSeoClient,
  input: BacklinksListRequest,
): Promise<{ totalCount: number; items: BacklinksAnchor[]; cost: number }> {
  const path = BACKLINKS_ANCHORS_PATH;
  const { result, cost } = await client.postOne<unknown>(path, {
    ...listBody(input),
    order_by: ["referring_domains,desc"],
  });
  const data = result[0] ? parseResponse(AnchorsResultSchema, result[0], path) : null;
  const items = (data?.items ?? []).map((item) => ({
    anchor: item.anchor ?? "",
    rank: item.rank ?? null,
    backlinks: whole(item.backlinks),
    referringDomains: whole(item.referring_domains),
    referringDomainsNofollow: whole(item.referring_domains_nofollow),
    firstSeen: toIsoDateTime(item.first_seen),
    lostDate: toIsoDateTime(item.lost_date),
  }));
  return { totalCount: whole(data?.total_count ?? items.length), items, cost };
}

/**
 * Domains that link to the targets but to none of `excludeTargets`, the ones passing the most
 * rank to the first target first. With one target and the own site excluded, this is the link
 * gap: who links to a competitor but not to you.
 */
export async function getBacklinksDomainIntersection(
  client: DataForSeoClient,
  input: {
    targets: readonly string[];
    excludeTargets?: readonly string[];
    includeSubdomains?: boolean;
    limit: number;
  },
): Promise<{ totalCount: number; items: IntersectingDomain[]; cost: number }> {
  const { targets, excludeTargets = [] } = input;
  if (targets.length === 0 || targets.length > BACKLINKS_LIMITS.intersectionTargets) {
    throw new RangeError(
      `A domain intersection needs 1 to ${BACKLINKS_LIMITS.intersectionTargets} targets`,
    );
  }
  if (excludeTargets.length > BACKLINKS_LIMITS.intersectionExcludes) {
    throw new RangeError(
      `A domain intersection excludes at most ${BACKLINKS_LIMITS.intersectionExcludes} targets`,
    );
  }
  const path = BACKLINKS_DOMAIN_INTERSECTION_PATH;
  const { result, cost } = await client.postOne<unknown>(
    path,
    compact({
      targets: Object.fromEntries(targets.map((target, index) => [String(index + 1), target])),
      exclude_targets: excludeTargets.length > 0 ? excludeTargets : undefined,
      include_subdomains: input.includeSubdomains ?? true,
      backlinks_status_type: "live",
      exclude_internal_backlinks: true,
      rank_scale: RANK_SCALE,
      limit: input.limit,
      order_by: ["1.rank,desc"],
    }),
  );
  const data = result[0] ? parseResponse(DomainIntersectionResultSchema, result[0], path) : null;
  const items = (data?.items ?? []).flatMap((item) => {
    const entries = targets.map(
      (_, index) => item.domain_intersection?.[String(index + 1)] ?? null,
    );
    const domain = entries.find((entry) => entry?.target)?.target;
    if (!domain) return [];
    const links = entries.map((entry) =>
      entry
        ? {
            rank: entry.rank ?? null,
            backlinks: whole(entry.backlinks),
            firstSeen: toIsoDateTime(entry.first_seen),
          }
        : null,
    );
    return [
      {
        domain,
        links,
        intersections: whole(
          item.summary?.intersections_count ?? links.filter((link) => link !== null).length,
        ),
      },
    ];
  });
  return { totalCount: whole(data?.total_count ?? items.length), items, cost };
}
