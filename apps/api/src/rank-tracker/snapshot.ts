import type { SerpLike } from "@seo-geo/core";
import type { GoogleOrganicSerp } from "@seo-geo/dataforseo";
import { Prisma, type SerpSnapshot } from "@seo-geo/db";
import { z } from "zod";

/** Links kept per SERP feature in a snapshot. */
const MAX_FEATURE_LINKS = 20;

const LinkSchema = z.object({ domain: z.string().nullable(), url: z.string().nullable() });

export const SnapshotOrganicSchema = z.array(
  LinkSchema.extend({
    position: z.int(),
    rankAbsolute: z.int().nullable(),
    title: z.string().nullable(),
  }),
);
export type SnapshotOrganic = z.infer<typeof SnapshotOrganicSchema>;

export const SnapshotFeaturesSchema = z.array(
  z.object({
    type: z.string(),
    rankAbsolute: z.int().nullable(),
    links: z.array(LinkSchema),
  }),
);

export const SnapshotAiOverviewSchema = z
  .object({
    rankAbsolute: z.int().nullable(),
    references: z.array(
      LinkSchema.extend({ title: z.string().nullable(), source: z.string().nullable() }),
    ),
  })
  .nullable();
export type SnapshotAiOverview = z.infer<typeof SnapshotAiOverviewSchema>;

/** The compact JSON columns of `serp_snapshot` for a parsed SERP. */
export function snapshotContent(serp: GoogleOrganicSerp, depth: number) {
  return {
    itemTypes: serp.itemTypes,
    resultsCount: serp.resultsCount === null ? null : BigInt(Math.round(serp.resultsCount)),
    checkUrl: serp.checkUrl,
    organic: serp.organic
      .filter((result) => result.rankGroup <= depth)
      .map((result) => ({
        position: result.rankGroup,
        rankAbsolute: result.rankAbsolute,
        domain: result.domain,
        url: result.url,
        title: result.title,
      })) satisfies SnapshotOrganic,
    features: serp.features.map((feature) => ({
      type: feature.type,
      rankAbsolute: feature.rankAbsolute,
      links: feature.links
        .slice(0, MAX_FEATURE_LINKS)
        .map((link) => ({ domain: link.domain, url: link.url })),
    })),
    aiOverview: serp.aiOverview
      ? {
          rankAbsolute: serp.aiOverview.rankAbsolute,
          references: serp.aiOverview.references.map((reference) => ({
            domain: reference.domain,
            url: reference.url,
            title: reference.title,
            source: reference.source,
          })),
        }
      : Prisma.DbNull,
  };
}

/** A stored snapshot in the shape rank attribution works on. */
export function snapshotToSerp(snapshot: SerpSnapshot): SerpLike {
  const organic = SnapshotOrganicSchema.parse(snapshot.organic);
  const features = SnapshotFeaturesSchema.parse(snapshot.features);
  const aiOverview = SnapshotAiOverviewSchema.parse(snapshot.aiOverview ?? null);
  return {
    itemTypes: snapshot.itemTypes,
    organic: organic.map((result) => ({
      rankGroup: result.position,
      rankAbsolute: result.rankAbsolute ?? result.position,
      domain: result.domain,
      url: result.url,
    })),
    features,
    aiOverview,
  };
}

export const EMPTY_SERP: SerpLike = { itemTypes: [], organic: [], features: [], aiOverview: null };
