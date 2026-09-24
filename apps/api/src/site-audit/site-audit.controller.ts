import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AuditIssueOccurrenceSchema,
  AuditPageListSchema,
  AuditPagesQuerySchema,
  AuditRunDetailSchema,
  AuditRunSchema,
  SiteAuditOverviewSchema,
  StartAuditSchema,
  type AuditIssueOccurrence,
  type AuditPageList,
  type AuditPagesQuery,
  type AuditRun,
  type AuditRunDetail,
  type SiteAuditOverview,
  type StartAudit,
} from "@seo-geo/contracts";
import { z } from "zod";

import {
  CurrentPrincipal,
  CurrentWorkspace,
  RequireRole,
  WorkspaceScoped,
} from "../auth/decorators.js";
import type { Principal, WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { SiteAuditService } from "./site-audit.service.js";

const OccurrencesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const IssueCodeSchema = z.string().regex(/^[a-z0-9_]{1,64}$/);

@ApiTags("site audit")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/projects/:projectId/site-audit")
export class SiteAuditController {
  constructor(private readonly audits: SiteAuditService) {}

  @Get()
  @ApiOperation({
    summary: "The latest completed audit with its issues, a running audit and history",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(SiteAuditOverviewSchema) })
  overview(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<SiteAuditOverview> {
    return this.audits.overview(workspace.id, projectId);
  }

  @Post("runs")
  @RequireRole("member")
  @ApiOperation({ summary: "Start an audit of the project's site" })
  @ApiOkResponse({ schema: toOpenApiSchema(AuditRunSchema) })
  start(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(StartAuditSchema)) body: StartAudit,
  ): Promise<AuditRun> {
    return this.audits.start(workspace.id, projectId, body, principal.user.id);
  }

  @Get("runs/:runId")
  @ApiOperation({ summary: "An audit with issue counts and changes since the previous one" })
  @ApiOkResponse({ schema: toOpenApiSchema(AuditRunDetailSchema) })
  detail(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("runId", "Audit") runId: string,
  ): Promise<AuditRunDetail> {
    return this.audits.detail(workspace.id, projectId, runId);
  }

  @Post("runs/:runId/cancel")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Stop a queued or running audit" })
  @ApiOkResponse({ schema: toOpenApiSchema(AuditRunSchema) })
  cancel(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("runId", "Audit") runId: string,
  ): Promise<AuditRun> {
    return this.audits.cancel(workspace.id, projectId, runId);
  }

  @Get("runs/:runId/pages")
  @ApiOperation({ summary: "Crawled pages of an audit" })
  @ApiOkResponse({ schema: toOpenApiSchema(AuditPageListSchema) })
  pages(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("runId", "Audit") runId: string,
    @Query(new ZodValidationPipe(AuditPagesQuerySchema)) query: AuditPagesQuery,
  ): Promise<AuditPageList> {
    return this.audits.pages(workspace.id, projectId, runId, query);
  }

  @Get("runs/:runId/issues/:code")
  @ApiOperation({ summary: "Pages affected by one issue" })
  @ApiOkResponse({
    schema: toOpenApiSchema(
      z.object({ data: z.array(AuditIssueOccurrenceSchema), total: z.int() }),
    ),
  })
  occurrences(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("runId", "Audit") runId: string,
    @Param("code", new ZodValidationPipe(IssueCodeSchema)) code: string,
    @Query(new ZodValidationPipe(OccurrencesQuerySchema))
    query: z.output<typeof OccurrencesQuerySchema>,
  ): Promise<{ data: AuditIssueOccurrence[]; total: number }> {
    return this.audits.occurrences(workspace.id, projectId, runId, code, query);
  }
}
