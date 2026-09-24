import { z } from "zod";

import { AppModeSchema, DeploymentModeSchema } from "./common.js";

export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("seo-geo-api"),
  version: z.string(),
  mode: AppModeSchema,
  deploymentMode: DeploymentModeSchema,
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
