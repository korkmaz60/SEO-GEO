import { z } from "zod";

import type { DataForSeoClient } from "../client.js";
import { parseResponse, toIsoDateTime } from "./shared.js";

// DataForSEO Backlinks API (Live). Field names follow the official DataForSEO client
// (dataforseo-client 2.1.7: BacklinksSummaryLiveRequestInfo, BacklinksSummaryLiveResultInfo).

const BASE = "/backlinks";
export const BACKLINKS_SUMMARY_PATH = `${BASE}/summary/live`;

/** Ranks are requested on DataForSEO's 0–100 scale, which reads like other SEO tools'. */
const RANK_SCALE = "one_hundred";

export interface BacklinksTarget {
  /** A domain, subdomain or page URL. */
  target: string;
  /** Count links to subdomains of a domain too (DataForSEO's default). */
  includeSubdomains?: boolean;
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

const count = z.number().nullish();

const SummarySchema = z.looseObject({
  target: z.string().nullish(),
  rank: count,
  backlinks: count,
  backlinks_spam_score: count,
  crawled_pages: count,
  first_seen: z.string().nullish(),
  broken_backlinks: count,
  broken_pages: count,
  referring_domains: count,
  referring_domains_nofollow: count,
  referring_main_domains: count,
  referring_ips: count,
  referring_subnets: count,
  referring_pages: count,
});

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
  const number = (value: number | null | undefined) => Math.round(value ?? 0);
  return {
    summary: {
      target: data.target ?? input.target,
      rank: data.rank ?? null,
      backlinks: number(data.backlinks),
      referringDomains: number(data.referring_domains),
      referringDomainsNofollow: number(data.referring_domains_nofollow),
      referringMainDomains: number(data.referring_main_domains),
      referringIps: number(data.referring_ips),
      referringSubnets: number(data.referring_subnets),
      referringPages: number(data.referring_pages),
      brokenBacklinks: number(data.broken_backlinks),
      brokenPages: number(data.broken_pages),
      spamScore: data.backlinks_spam_score ?? null,
      firstSeen: toIsoDateTime(data.first_seen),
      crawledPages: number(data.crawled_pages),
    },
    cost,
  };
}
