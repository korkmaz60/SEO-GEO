import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  DomainOverviewQuoteSchema,
  DomainOverviewRequestSchema,
  DomainOverviewSchema,
  type DomainOverview,
  type DomainOverviewQuote,
  type DomainOverviewRequest,
} from "@seo-geo/contracts";

import {
  CurrentWorkspace,
  RequireRole,
  RequireScope,
  WorkspaceScoped,
} from "../auth/decorators.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { DomainOverviewService } from "./domain-overview.service.js";

@ApiTags("domain research")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/research/domains")
export class DomainOverviewController {
  constructor(private readonly domains: DomainOverviewService) {}

  @Post("quote")
  @RequireScope("read")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Cost of a domain overview (0 when everything is cached)" })
  @ApiOkResponse({ schema: toOpenApiSchema(DomainOverviewQuoteSchema) })
  quote(
    @Body(new ZodValidationPipe(DomainOverviewRequestSchema)) body: DomainOverviewRequest,
  ): Promise<DomainOverviewQuote> {
    return this.domains.quote(body);
  }

  @Post()
  @RequireScope("run:paid")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({
    summary:
      "Organic keywords and traffic, history, top keywords, competitors and backlink summary of a domain",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(DomainOverviewSchema) })
  run(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(DomainOverviewRequestSchema)) body: DomainOverviewRequest,
  ): Promise<DomainOverview> {
    return this.domains.overview(workspace.id, body);
  }
}
