import { z } from "zod";

import { BacklinkProfileSchema, DataSourceStateSchema } from "./domain-overview.js";
import { BrandKindSchema, MAX_BRAND_SLOTS } from "./projects.js";

/** What a project's backlink data includes. */
export const BACKLINK_LIMITS = {
  /** Months of history, the current one included. */
  historyMonths: 12,
  /** Days of new and lost links, ending the day before the data is fetched. */
  newLostDays: 30,
  referringDomains: 100,
  /** The strongest link of each of this many referring domains. */
  backlinks: 100,
  anchors: 100,
  /** Referring domains per competitor in the link gap. */
  linkGap: 100,
} as const;

/** Loads backlink data; `refresh` loads every part again even when it is cached (D23). */
export const BacklinksLoadSchema = z.strictObject({
  refresh: z.boolean().optional(),
});
export type BacklinksLoad = z.infer<typeof BacklinksLoadSchema>;

export const BacklinkHistoryPointSchema = z.object({
  /** First day of the month (YYYY-MM-01); the counts are as of that day. */
  month: z.iso.date(),
  /** 0–100. */
  rank: z.number().nullable(),
  backlinks: z.int(),
  referringDomains: z.int(),
  /** Compared with the month before. */
  newReferringDomains: z.int(),
  lostReferringDomains: z.int(),
  newBacklinks: z.int(),
  lostBacklinks: z.int(),
});
export type BacklinkHistoryPoint = z.infer<typeof BacklinkHistoryPointSchema>;

/** Links gained and lost in one day. */
export const BacklinkNewLostDaySchema = z.object({
  date: z.iso.date(),
  newReferringDomains: z.int(),
  lostReferringDomains: z.int(),
  newBacklinks: z.int(),
  lostBacklinks: z.int(),
});
export type BacklinkNewLostDay = z.infer<typeof BacklinkNewLostDaySchema>;

export const ReferringDomainSchema = z.object({
  domain: z.string(),
  /** Rank the domain passes to the target, 0–100. */
  rank: z.number().nullable(),
  backlinks: z.int(),
  /** Average spam score of its links, 0–100. */
  spamScore: z.number().nullable(),
  firstSeen: z.iso.datetime().nullable(),
});
export type ReferringDomain = z.infer<typeof ReferringDomainSchema>;

export const BacklinkSchema = z.object({
  domainFrom: z.string(),
  urlFrom: z.string(),
  /** Title of the linking page. */
  pageTitle: z.string().nullable(),
  urlTo: z.string(),
  anchor: z.string().nullable(),
  /** `anchor`, `image`, `redirect`, `canonical`, …; `null` when unknown. */
  type: z.string().nullable(),
  dofollow: z.boolean(),
  /** Rank the link passes to the target, 0–100. */
  rank: z.number().nullable(),
  /** Rank of the linking domain, 0–100. */
  domainRank: z.number().nullable(),
  firstSeen: z.iso.datetime().nullable(),
  lastSeen: z.iso.datetime().nullable(),
  /** Found at DataForSEO's latest visit of the linking page and not before. */
  isNew: z.boolean(),
  /** Points to a page that answers with a 4xx or 5xx status. */
  isBroken: z.boolean(),
  /** Links from the same domain, of which this is the strongest. */
  linksFromDomain: z.int().nullable(),
});
export type Backlink = z.infer<typeof BacklinkSchema>;

export const BacklinkAnchorSchema = z.object({
  /** Empty for links without text, such as images. */
  anchor: z.string(),
  referringDomains: z.int(),
  /** Referring domains with at least one nofollow link with this anchor. */
  nofollowDomains: z.int(),
  backlinks: z.int(),
  firstSeen: z.iso.datetime().nullable(),
});
export type BacklinkAnchor = z.infer<typeof BacklinkAnchorSchema>;

/** The top rows of a list and how many rows it has in all. */
function topRows<T extends z.ZodType>(item: T) {
  return z.object({ total: z.int(), items: z.array(item) });
}

export const ReferringDomainListSchema = topRows(ReferringDomainSchema);
export const BacklinkListSchema = topRows(BacklinkSchema);
export const BacklinkAnchorListSchema = topRows(BacklinkAnchorSchema);

/** A project's backlink profile (docs/backend.md, "Domain overview and backlinks"). */
export const ProjectBacklinksSchema = z.object({
  projectId: z.uuid(),
  /** The analyzed host, e.g. `example.com`. */
  target: z.string(),
  /** Whether links to subdomains of the target count (the project's setting). */
  includeSubdomains: z.boolean(),
  /** `null` when the Backlinks API knows no links to the target. */
  profile: BacklinkProfileSchema.nullable(),
  /** Monthly, oldest first. */
  history: z.array(BacklinkHistoryPointSchema),
  /** Daily, oldest first, ending the day before the data was fetched. */
  newLost: z.array(BacklinkNewLostDaySchema),
  referringDomains: ReferringDomainListSchema,
  backlinks: BacklinkListSchema,
  anchors: BacklinkAnchorListSchema,
  /** When the data was fetched (its oldest part) and whether all of it came from the cache. */
  source: DataSourceStateSchema,
  /** What this request cost; 0 when everything came from the cache. */
  costUsd: z.number(),
});
export type ProjectBacklinks = z.infer<typeof ProjectBacklinksSchema>;

/** What a project's backlink page can show without paying, and what loading would cost. */
export const ProjectBacklinksStateSchema = z.object({
  target: z.string(),
  /** `null` until every part has been loaded in the last 7 days. */
  report: ProjectBacklinksSchema.nullable(),
  /** Upper bound in USD for the parts that are not cached; 0 when `report` is set. */
  estimatedCostUsd: z.number(),
  /** Upper bound in USD for loading every part again (Refresh). */
  refreshCostUsd: z.number(),
});
export type ProjectBacklinksState = z.infer<typeof ProjectBacklinksStateSchema>;

/** A brand of the project in a backlink comparison. */
export const BacklinkBrandSchema = z.object({
  brandId: z.uuid(),
  kind: BrandKindSchema,
  name: z.string(),
  colorSlot: z.int().min(1).max(MAX_BRAND_SLOTS),
  /** Whose links are counted: the project's domain, or a competitor's first domain. */
  domain: z.string(),
});
export type BacklinkBrand = z.infer<typeof BacklinkBrandSchema>;

export const BacklinkComparisonSchema = BacklinkBrandSchema.extend({
  /** `null` when the Backlinks API knows no links to the domain. */
  profile: BacklinkProfileSchema.nullable(),
});
export type BacklinkComparison = z.infer<typeof BacklinkComparisonSchema>;

export const LinkGapDomainSchema = z.object({
  /** A domain that links to competitors but not to the project. */
  domain: z.string(),
  /** Its links to each competitor it links to, in brand order. */
  links: z.array(
    z.object({
      brandId: z.uuid(),
      /** Rank the domain passes to the competitor, 0–100. */
      rank: z.number().nullable(),
      backlinks: z.int(),
      firstSeen: z.iso.datetime().nullable(),
    }),
  ),
  /** The highest rank it passes to one of them, 0–100. */
  rank: z.number().nullable(),
});
export type LinkGapDomain = z.infer<typeof LinkGapDomainSchema>;

/** Backlink profiles of the project and its competitors, and the link gap. */
export const BacklinkCompetitorsSchema = z.object({
  projectId: z.uuid(),
  target: z.string(),
  /** The project first, then its competitors in brand order. */
  brands: z.array(BacklinkComparisonSchema),
  /**
   * Domains among the strongest referring domains of each competitor that do not link to the
   * project; those linking to the most competitors first, then by rank.
   */
  linkGap: z.array(LinkGapDomainSchema),
  source: DataSourceStateSchema,
  costUsd: z.number(),
});
export type BacklinkCompetitors = z.infer<typeof BacklinkCompetitorsSchema>;

export const BacklinkCompetitorsStateSchema = z.object({
  target: z.string(),
  /** The project and the competitors a comparison covers (from the project settings). */
  brands: z.array(BacklinkBrandSchema),
  /** `null` until every part has been loaded in the last 7 days, or without competitors. */
  report: BacklinkCompetitorsSchema.nullable(),
  estimatedCostUsd: z.number(),
  refreshCostUsd: z.number(),
});
export type BacklinkCompetitorsState = z.infer<typeof BacklinkCompetitorsStateSchema>;
