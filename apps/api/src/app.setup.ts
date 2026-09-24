import type { NestExpressApplication } from "@nestjs/platform-express";
import { toNodeHandler } from "better-auth/node";

import { AUTH } from "./auth/auth.tokens.js";
import { AUTH_BASE_PATH, type Auth } from "./auth/auth.js";
import { setupOpenApi } from "./common/openapi.js";
import { ProblemDetailsFilter } from "./common/problem-details.filter.js";
import { requestIdMiddleware } from "./common/request-id.js";
import type { AppConfig } from "./config/env.js";

export const API_PREFIX = "api/v1";

/**
 * HTTP concerns shared by `main.ts` and the end-to-end tests. The application must be
 * created with `bodyParser: false`: Better Auth reads its request bodies itself, so the JSON
 * parser is registered after the auth handler.
 */
export function configureApp(app: NestExpressApplication, config: AppConfig): void {
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(requestIdMiddleware);

  const auth = app.get<Auth>(AUTH);
  app.getHttpAdapter().getInstance().all(`${AUTH_BASE_PATH}/*splat`, toNodeHandler(auth));

  app.useBodyParser("json", { limit: "1mb" });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemDetailsFilter());
  if (config.apiDocsEnabled) setupOpenApi(app, config);
}
