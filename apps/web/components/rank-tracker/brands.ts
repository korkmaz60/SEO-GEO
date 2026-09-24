import type { RankTrackerSummary } from "@seo-geo/contracts";

/** What the rank tracker shows of a brand: the own site (slot 1) or a competitor. */
export interface BrandRef {
  id: string;
  name: string;
  kind: "OWN" | "COMPETITOR";
  colorSlot: number;
}

export function brandsOf(summary: RankTrackerSummary): BrandRef[] {
  return summary.shareOfVoice.map((entry) => ({
    id: entry.entityId,
    name: entry.name,
    kind: entry.kind,
    colorSlot: entry.colorSlot,
  }));
}
