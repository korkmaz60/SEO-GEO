import type { IntegrationType } from "@seo-geo/contracts";
import type { Prisma } from "@seo-geo/db";

/**
 * Deletes what was imported for a project from one source. Called whenever a source goes away
 * or changes, so data of an old property never mixes with a new one.
 */
export function deleteImportedFacts(
  db: Prisma.TransactionClient,
  projectId: string,
  type: IntegrationType,
): Prisma.PrismaPromise<Prisma.BatchPayload>[] {
  return type === "GSC"
    ? [
        db.gscSiteDaily.deleteMany({ where: { projectId } }),
        db.gscQueryDaily.deleteMany({ where: { projectId } }),
        db.gscPageDaily.deleteMany({ where: { projectId } }),
      ]
    : [db.ga4PageDaily.deleteMany({ where: { projectId } })];
}
