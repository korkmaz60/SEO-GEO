import type { NestExpressApplication } from "@nestjs/platform-express";

import { setupOpenApi } from "./common/openapi.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import { requestIdMiddleware } from "./common/request-id.js";
import type { AppConfig } from "./config/env.js";

export const API_PREFIX = "v1";

/** HTTP concerns shared by `main.ts` and the end-to-end tests. */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.disable("x-powered-by");
  app.use(requestIdMiddleware);
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemDetailsFilter());
  if (config.apiDocsEnabled) setupOpenApi(app, config);
}
