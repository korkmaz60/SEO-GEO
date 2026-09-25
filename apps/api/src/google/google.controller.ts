import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { ApiExcludeEndpoint, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  GoogleAuthorizeSchema,
  GoogleIntegrationsSchema,
  GooglePropertiesSchema,
  IntegrationTypeSchema,
  PerformanceDataSchema,
  PerformanceQuerySchema,
  ProjectIntegrationsSchema,
  SelectGa4PropertySchema,
  SelectGscSiteSchema,
  type GoogleIntegrations,
  type GoogleProperties,
  type IntegrationType,
  type PerformanceData,
  type ProjectIntegrations,
  type SelectGa4Property,
  type SelectGscSite,
} from "@seo-geo/contracts";
import type { Response } from "express";
import { z } from "zod";

import {
  CurrentPrincipal,
  CurrentWorkspace,
  RequireRole,
  SessionOnly,
  WorkspaceScoped,
} from "../auth/decorators.js";
import type { Principal, WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { Meta, type RequestMeta } from "../common/request-meta.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { GoogleConnectionsService } from "./google-connections.service.js";
import { ProjectIntegrationsService } from "./project-integrations.service.js";

const CallbackQuerySchema = z.object({
  code: z.string().max(2048).optional(),
  state: z.string().max(4096).optional(),
  error: z.string().max(200).optional(),
});
const PropertiesQuerySchema = z.object({ projectId: z.uuid().optional() });

/** Google redirects the browser here after consent (through the web app's /api proxy). */
@ApiTags("integrations")
@Controller("integrations/google")
export class GoogleCallbackController {
  constructor(private readonly connections: GoogleConnectionsService) {}

  @Get("callback")
  @ApiExcludeEndpoint()
  async callback(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(CallbackQuerySchema)) query: z.output<typeof CallbackQuerySchema>,
    @Meta() meta: RequestMeta,
    @Res() response: Response,
  ): Promise<void> {
    response.redirect(302, await this.connections.callback(principal.user.id, query, meta));
  }
}

@ApiTags("integrations")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/integrations/google")
export class GoogleConnectionsController {
  constructor(private readonly connections: GoogleConnectionsService) {}

  @Get()
  @ApiOperation({ summary: "Whether Google sign-in is available and the connected accounts" })
  @ApiOkResponse({ schema: toOpenApiSchema(GoogleIntegrationsSchema) })
  status(@CurrentWorkspace() workspace: WorkspaceContext): Promise<GoogleIntegrations> {
    return this.connections.status(workspace.id);
  }

  @Post("authorize")
  @SessionOnly()
  @HttpCode(200)
  @RequireRole("admin")
  @ApiOperation({ summary: "Start connecting a Google account; returns the consent URL" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ url: z.string() })) })
  authorize(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(GoogleAuthorizeSchema)) body: { projectId: string },
  ): Promise<{ url: string }> {
    return this.connections.authorize(workspace.id, body.projectId, principal.user.id);
  }

  @Get(":connectionId/properties")
  @RequireRole("member")
  @ApiOperation({ summary: "Search Console sites and GA4 properties the account can read" })
  @ApiOkResponse({ schema: toOpenApiSchema(GooglePropertiesSchema) })
  properties(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("connectionId", "Google connection") connectionId: string,
    @Query(new ZodValidationPipe(PropertiesQuerySchema))
    query: z.output<typeof PropertiesQuerySchema>,
  ): Promise<GoogleProperties> {
    return this.connections.properties(workspace.id, connectionId, query.projectId);
  }

  @Delete(":connectionId")
  @SessionOnly()
  @HttpCode(204)
  @RequireRole("admin")
  @ApiOperation({ summary: "Disconnect a Google account and stop its imports" })
  disconnect(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("connectionId", "Google connection") connectionId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.connections.disconnect(workspace.id, connectionId, meta);
  }
}

@ApiTags("integrations")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/projects/:projectId")
export class ProjectIntegrationsController {
  constructor(private readonly integrations: ProjectIntegrationsService) {}

  @Get("integrations")
  @ApiOperation({ summary: "The project's Search Console and GA4 sources" })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectIntegrationsSchema) })
  list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<ProjectIntegrations> {
    return this.integrations.list(workspace.id, projectId);
  }

  @Put("integrations/gsc")
  @RequireRole("member")
  @ApiOperation({ summary: "Use a Search Console property for the project" })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectIntegrationsSchema) })
  selectGsc(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(SelectGscSiteSchema)) body: SelectGscSite,
  ): Promise<ProjectIntegrations> {
    return this.integrations.selectGsc(workspace.id, projectId, body);
  }

  @Put("integrations/ga4")
  @RequireRole("member")
  @ApiOperation({ summary: "Use a GA4 property for the project" })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectIntegrationsSchema) })
  selectGa4(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(SelectGa4PropertySchema)) body: SelectGa4Property,
  ): Promise<ProjectIntegrations> {
    return this.integrations.selectGa4(workspace.id, projectId, body);
  }

  @Delete("integrations/:type")
  @HttpCode(204)
  @RequireRole("member")
  @ApiOperation({ summary: "Remove a source and its imported data from the project" })
  remove(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Param("type", new ZodValidationPipe(z.string().toUpperCase().pipe(IntegrationTypeSchema)))
    type: IntegrationType,
  ): Promise<void> {
    return this.integrations.remove(workspace.id, projectId, type);
  }

  @Post("integrations/sync")
  @HttpCode(202)
  @RequireRole("member")
  @ApiOperation({ summary: "Import the latest Search Console and GA4 data now" })
  sync(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<void> {
    return this.integrations.syncNow(workspace.id, projectId);
  }

  @Get("performance")
  @ApiOperation({
    summary: "Search Console and GA4 performance for a period, with the previous one",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(PerformanceDataSchema) })
  performance(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Query(new ZodValidationPipe(PerformanceQuerySchema)) query: { days: number },
  ): Promise<PerformanceData> {
    return this.integrations.performance(workspace.id, projectId, query.days);
  }
}
