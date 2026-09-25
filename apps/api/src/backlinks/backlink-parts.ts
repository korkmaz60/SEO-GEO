import {
  BACKLINK_LIMITS,
  BacklinkAnchorListSchema,
  BacklinkHistoryPointSchema,
  BacklinkListSchema,
  BacklinkNewLostDaySchema,
  BacklinkProfileSchema,
  ReferringDomainListSchema,
  type BacklinkProfile,
} from "@seo-geo/contracts";
import {
  estimateBacklinksCost,
  getBacklinks,
  getBacklinksAnchors,
  getBacklinksDomainIntersection,
  getBacklinksHistory,
  getBacklinksNewLostTimeseries,
  getBacklinksSummary,
  getReferringDomains,
  type BacklinksSummary,
} from "@seo-geo/dataforseo";
import { z } from "zod";

import type { ProviderPart } from "../providers/cached-parts.service.js";

// The Backlinks API requests of the domain overview and the project backlinks page, each
// cached on its own for every workspace (docs/backend.md, "Domain overview and backlinks").
// Operations are versioned: bump `@N` when a cached shape changes.

/** Whose links are counted: a host without `www.`, with or without its subdomains. */
export interface BacklinkTarget {
  target: string;
  includeSubdomains: boolean;
}

/** Subdomains count unless they are left out, as with DataForSEO; the key says only that. */
function targetParams({ target, includeSubdomains }: BacklinkTarget): object {
  return includeSubdomains ? { target } : { target, includeSubdomains: false };
}

/** `null` for a target without known links, which DataForSEO reports as zeros. */
export function toProfile(summary: BacklinksSummary | null): BacklinkProfile | null {
  if (!summary || (summary.backlinks === 0 && summary.referringDomains === 0)) return null;
  return {
    rank: summary.rank,
    backlinks: summary.backlinks,
    referringDomains: summary.referringDomains,
    referringDomainsNofollow: summary.referringDomainsNofollow,
    referringMainDomains: summary.referringMainDomains,
    referringIps: summary.referringIps,
    brokenBacklinks: summary.brokenBacklinks,
    spamScore: summary.spamScore,
    firstSeen: summary.firstSeen,
  };
}

/** A UTC calendar day (YYYY-MM-DD) `days` before `now`. */
function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

/** First day of the month `months` before `now` (YYYY-MM-DD, UTC). */
export function monthsBefore(now: Date, months: number): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 1));
  return date.toISOString().slice(0, 10);
}

export const SummaryValueSchema = z.object({ profile: BacklinkProfileSchema.nullable() });
export type SummaryValue = z.infer<typeof SummaryValueSchema>;

/** The backlink profile: rank, backlinks, referring domains, nofollow and broken links. */
export function summaryPart(target: BacklinkTarget): ProviderPart<SummaryValue> {
  return {
    operation: "backlinks.summary@1",
    params: targetParams(target),
    schema: SummaryValueSchema,
    estimateUsd: estimateBacklinksCost({ rows: 1 }),
    fetch: async (client) => {
      const response = await getBacklinksSummary(client, target);
      return { value: { profile: toProfile(response.summary) }, cost: response.cost, units: 1 };
    },
  };
}

const HistoryValueSchema = z.object({ months: z.array(BacklinkHistoryPointSchema) });
export type HistoryValue = z.infer<typeof HistoryValueSchema>;

/**
 * The last {@link BACKLINK_LIMITS.historyMonths} months, the current one included, from the
 * date of the request. The Backlinks API counts subdomains in the history whatever the
 * project's setting.
 */
export function historyPart(target: string, now: Date): ProviderPart<HistoryValue> {
  const months = BACKLINK_LIMITS.historyMonths;
  return {
    operation: "backlinks.history@1",
    params: { target, months },
    schema: HistoryValueSchema,
    estimateUsd: estimateBacklinksCost({ rows: months }),
    fetch: async (client) => {
      const response = await getBacklinksHistory(client, {
        target,
        dateFrom: monthsBefore(now, months - 1),
      });
      const points = response.months.map((month) => ({
        month: `${month.date.slice(0, 7)}-01`,
        rank: month.rank,
        backlinks: month.backlinks,
        referringDomains: month.referringDomains,
        newReferringDomains: month.newReferringDomains,
        lostReferringDomains: month.lostReferringDomains,
        newBacklinks: month.newBacklinks,
        lostBacklinks: month.lostBacklinks,
      }));
      return { value: { months: points }, cost: response.cost, units: points.length };
    },
  };
}

const NewLostValueSchema = z.object({ days: z.array(BacklinkNewLostDaySchema) });
export type NewLostValue = z.infer<typeof NewLostValueSchema>;

/** New and lost links of the {@link BACKLINK_LIMITS.newLostDays} days before the request. */
export function newLostPart(target: BacklinkTarget, now: Date): ProviderPart<NewLostValue> {
  const days = BACKLINK_LIMITS.newLostDays;
  return {
    operation: "backlinks.timeseries_new_lost_summary@1",
    params: { ...targetParams(target), days },
    schema: NewLostValueSchema,
    estimateUsd: estimateBacklinksCost({ rows: days }),
    fetch: async (client) => {
      // Up to yesterday: today's links are still being found.
      const response = await getBacklinksNewLostTimeseries(client, {
        ...target,
        dateFrom: daysBefore(now, days),
        dateTo: daysBefore(now, 1),
        groupRange: "day",
      });
      const points = response.periods.map((period) => ({
        date: period.date,
        newReferringDomains: period.newReferringDomains,
        lostReferringDomains: period.lostReferringDomains,
        newBacklinks: period.newBacklinks,
        lostBacklinks: period.lostBacklinks,
      }));
      return { value: { days: points }, cost: response.cost, units: points.length };
    },
  };
}

export type ReferringDomainsValue = z.infer<typeof ReferringDomainListSchema>;

/** The referring domains passing the most rank. */
export function referringDomainsPart(target: BacklinkTarget): ProviderPart<ReferringDomainsValue> {
  const limit = BACKLINK_LIMITS.referringDomains;
  return {
    operation: "backlinks.referring_domains@1",
    params: { ...targetParams(target), limit },
    schema: ReferringDomainListSchema,
    estimateUsd: estimateBacklinksCost({ rows: limit }),
    fetch: async (client) => {
      const response = await getReferringDomains(client, { ...target, limit });
      const items = response.items.map((item) => ({
        domain: item.domain,
        rank: item.rank,
        backlinks: item.backlinks,
        spamScore: item.spamScore,
        firstSeen: item.firstSeen,
      }));
      return {
        value: { total: response.totalCount, items },
        cost: response.cost,
        units: items.length,
      };
    },
  };
}

export type BacklinksValue = z.infer<typeof BacklinkListSchema>;

/** The strongest link of each referring domain, the strongest links first. */
export function backlinksPart(target: BacklinkTarget): ProviderPart<BacklinksValue> {
  const limit = BACKLINK_LIMITS.backlinks;
  return {
    operation: "backlinks.backlinks@1",
    params: { ...targetParams(target), limit, mode: "one_per_domain" },
    schema: BacklinkListSchema,
    estimateUsd: estimateBacklinksCost({ rows: limit }),
    fetch: async (client) => {
      const response = await getBacklinks(client, { ...target, limit, mode: "one_per_domain" });
      const items = response.items.map((item) => ({
        domainFrom: item.domainFrom,
        urlFrom: item.urlFrom,
        pageTitle: item.pageTitle,
        urlTo: item.urlTo,
        anchor: item.anchor,
        type: item.type,
        dofollow: item.dofollow,
        rank: item.rank,
        domainRank: item.domainFromRank,
        firstSeen: item.firstSeen,
        lastSeen: item.lastSeen,
        isNew: item.isNew,
        isBroken: item.isBroken,
        linksFromDomain: item.groupCount,
      }));
      return {
        value: { total: response.totalCount, items },
        cost: response.cost,
        units: items.length,
      };
    },
  };
}

export type AnchorsValue = z.infer<typeof BacklinkAnchorListSchema>;

/** Anchor texts used by the most referring domains. */
export function anchorsPart(target: BacklinkTarget): ProviderPart<AnchorsValue> {
  const limit = BACKLINK_LIMITS.anchors;
  return {
    operation: "backlinks.anchors@1",
    params: { ...targetParams(target), limit },
    schema: BacklinkAnchorListSchema,
    estimateUsd: estimateBacklinksCost({ rows: limit }),
    fetch: async (client) => {
      const response = await getBacklinksAnchors(client, { ...target, limit });
      const items = response.items.map((item) => ({
        anchor: item.anchor,
        referringDomains: item.referringDomains,
        nofollowDomains: item.referringDomainsNofollow,
        backlinks: item.backlinks,
        firstSeen: item.firstSeen,
      }));
      return {
        value: { total: response.totalCount, items },
        cost: response.cost,
        units: items.length,
      };
    },
  };
}

const LinkGapValueSchema = z.object({
  total: z.int(),
  items: z.array(
    z.object({
      domain: z.string(),
      rank: z.number().nullable(),
      backlinks: z.int(),
      firstSeen: z.iso.datetime().nullable(),
    }),
  ),
});
export type LinkGapValue = z.infer<typeof LinkGapValueSchema>;

/**
 * The strongest domains linking to `competitor` but not to `own` (a domain intersection
 * with one target, the own site excluded).
 */
export function linkGapPart(competitor: string, own: string): ProviderPart<LinkGapValue> {
  const limit = BACKLINK_LIMITS.linkGap;
  return {
    operation: "backlinks.domain_intersection@1",
    params: { targets: [competitor], exclude: [own], limit },
    schema: LinkGapValueSchema,
    estimateUsd: estimateBacklinksCost({ rows: limit }),
    fetch: async (client) => {
      const response = await getBacklinksDomainIntersection(client, {
        targets: [competitor],
        excludeTargets: [own],
        limit,
      });
      const items = response.items.map((item) => ({
        domain: item.domain,
        rank: item.links[0]?.rank ?? null,
        backlinks: item.links[0]?.backlinks ?? 0,
        firstSeen: item.links[0]?.firstSeen ?? null,
      }));
      return {
        value: { total: response.totalCount, items },
        cost: response.cost,
        units: items.length,
      };
    },
  };
}
