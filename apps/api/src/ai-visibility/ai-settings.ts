import { DEFAULT_AI_PLATFORMS, type AiSettings } from "@seo-geo/contracts";
import type { Prisma, ProjectAiSettings } from "@seo-geo/db";
import { z } from "zod";

/** Settings of a project that never saved any. */
export const DEFAULT_AI_SETTINGS: AiSettings = {
  platforms: [...DEFAULT_AI_PLATFORMS],
  frequency: "WEEKLY",
  samples: 1,
  models: { CLAUDE: null, PERPLEXITY: null },
  sentiment: false,
};

const StoredModelsSchema = z
  .object({ CLAUDE: z.string().min(1).nullish(), PERPLEXITY: z.string().min(1).nullish() })
  .catch({});

export function toAiSettings(row: ProjectAiSettings | null): AiSettings {
  if (!row) return structuredClone(DEFAULT_AI_SETTINGS);
  const models = StoredModelsSchema.parse(row.models);
  return {
    platforms: row.platforms,
    frequency: row.frequency,
    samples: row.samples,
    models: { CLAUDE: models.CLAUDE ?? null, PERPLEXITY: models.PERPLEXITY ?? null },
    sentiment: row.sentiment,
  };
}

export async function loadAiSettings(
  db: Prisma.TransactionClient,
  projectId: string,
): Promise<AiSettings> {
  return toAiSettings(await db.projectAiSettings.findUnique({ where: { projectId } }));
}
