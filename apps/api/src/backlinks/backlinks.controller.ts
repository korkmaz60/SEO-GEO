import { Body, Controller, Get, HttpCode, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  BacklinkCompetitorsSchema,
  BacklinkCompetitorsStateSchema,
  BacklinksLoadSchema,
  ProjectBacklinksSchema,
  ProjectBacklinksStateSchema,
  type BacklinkCompetitors,
  type BacklinkCompetitorsState,
  type BacklinksLoad,
  type ProjectBacklinks,
  type ProjectBacklinksState,
} from "@seo-geo/contracts";

import {
  CurrentWorkspace,
  RequireRole,
  RequireScope,
  WorkspaceScoped,
} from "../auth/decorators.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { BacklinksService } from "./backlinks.service.js";

@ApiTags("backlinks")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/projects/:projectId/backlinks")
export class BacklinksController {
  constructor(private readonly backlinks: BacklinksService) {}

  @Get()
  @ApiOperation({
    summary:
      "The project's backlink profile when it is cached (free), and what loading or refreshing it costs",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectBacklinksStateSchema) })
  state(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<ProjectBacklinksState> {
    return this.backlinks.state(workspace.id, projectId);
  }

  @Post()
  @RequireScope("run:paid")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({
    summary:
      "Load the project's backlink profile, history, new and lost links, referring domains, backlinks and anchors; `refresh` loads every part again",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectBacklinksSchema) })
  load(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(BacklinksLoadSchema)) body: BacklinksLoad,
  ): Promise<ProjectBacklinks> {
    return this.backlinks.load(workspace.id, projectId, body);
  }

  @Get("competitors")
  @ApiOperation({
    summary:
      "The competitors' backlink profiles and the link gap when they are cached (free), and what loading them costs",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(BacklinkCompetitorsStateSchema) })
  competitorsState(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<BacklinkCompetitorsState> {
    return this.backlinks.competitorsState(workspace.id, projectId);
  }

  @Post("competitors")
  @RequireScope("run:paid")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({
    summary:
      "Load the backlink profiles of the project's competitors and the domains that link to them but not to the project; `refresh` loads every part again",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(BacklinkCompetitorsSchema) })
  loadCompetitors(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(BacklinksLoadSchema)) body: BacklinksLoad,
  ): Promise<BacklinkCompetitors> {
    return this.backlinks.loadCompetitors(workspace.id, projectId, body);
  }
}
