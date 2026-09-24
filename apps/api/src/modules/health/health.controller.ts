import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthResponseSchema, type HealthResponse } from "@seo-geo/contracts";

import { toOpenApiSchema } from "../../common/openapi.js";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get()
  @ApiOperation({ summary: "Liveness: the process is up and serving requests" })
  @ApiOkResponse({ schema: toOpenApiSchema(HealthResponseSchema) })
  check(): HealthResponse {
    return {
      status: "ok",
      service: "seo-geo-api",
      version: this.config.version,
      mode: this.config.appMode,
      deploymentMode: this.config.deploymentMode,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
