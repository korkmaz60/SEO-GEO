import type { NestExpressApplication } from "@nestjs/platform-express";
import { ErrorCode } from "@seo-geo/contracts";
import { toNodeHandler } from "better-auth/node";
import type { Request, Response } from "express";

import { apiKeyOf } from "./auth/api-key-header.js";
import { authRequestContext } from "./auth/auth-request-context.js";
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
  const authHandler = toNodeHandler(auth);
  app
    .getHttpAdapter()
    .getInstance()
    .all(`${AUTH_BASE_PATH}/*splat`, (request: Request, response: Response) => {
      // API keys are for /api/v1 only: through the account endpoints a key could create
      // other keys, invite members or change the account, beyond its workspace and scopes.
      if (apiKeyOf((name) => request.headers[name])) {
        response.status(403).type("application/problem+json").json({
          type: "about:blank",
          title: "Forbidden",
          status: 403,
          code: ErrorCode.Forbidden,
          detail: "API keys cannot be used for account endpoints. Sign in instead.",
        });
        return;
      }
      // Better Auth reads the client IP (rate limits, sessions) from X-Forwarded-For. Express
      // has already resolved it from the proxy chain it trusts (TRUST_PROXY), so hand over
      // exactly that address instead of a header the client could have written.
      if (request.ip) request.headers["x-forwarded-for"] = request.ip;
      else delete request.headers["x-forwarded-for"];
      const userAgent = request.headers["user-agent"];
      const context = {
        ip: request.ip ?? null,
        userAgent: typeof userAgent === "string" ? userAgent.slice(0, 512) : null,
        actorId: null,
      };
      return authRequestContext.run(context, () => authHandler(request, response));
    });

  app.useBodyParser("json", { limit: "1mb" });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new ProblemDetailsFilter());
  if (config.apiDocsEnabled) setupOpenApi(app, config);
}
