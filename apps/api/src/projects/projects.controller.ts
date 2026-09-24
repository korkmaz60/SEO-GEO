import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  BrandEntitySchema,
  CompetitorInputSchema,
  CreateProjectSchema,
  ProjectDetailSchema,
  ProjectSchema,
  UpdateBrandSchema,
  UpdateProjectSchema,
  type BrandEntity,
  type CreateProject,
  type Project,
  type ProjectDetail,
  type UpdateBrand,
  type UpdateProject,
} from "@seo-geo/contracts";
import { z } from "zod";

import { CurrentWorkspace, RequireRole, WorkspaceScoped } from "../auth/decorators.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { Meta, type RequestMeta } from "../common/request-meta.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { ProjectsService, toProject } from "./projects.service.js";

const ListQuerySchema = z.strictObject({ archived: z.stringbool().default(false) });

@ApiTags("projects")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "Projects of the workspace (archived ones with ?archived=true)" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ data: z.array(ProjectSchema) })) })
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(ListQuerySchema)) query: z.output<typeof ListQuerySchema>,
  ): Promise<{ data: Project[] }> {
    return { data: (await this.projects.list(workspace.id, query.archived)).map(toProject) };
  }

  @Post()
  @RequireRole("admin")
  @ApiOperation({ summary: "Create a project with its own brand and competitors" })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectDetailSchema) })
  create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(CreateProjectSchema)) body: CreateProject,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectDetail> {
    return this.projects.create(workspace.id, body, meta);
  }

  @Get(":projectId")
  @ApiOperation({ summary: "A project with its brand and competitors" })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectDetailSchema) })
  get(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<ProjectDetail> {
    return this.projects.detail(workspace.id, projectId);
  }

  @Patch(":projectId")
  @RequireRole("member")
  @ApiOperation({ summary: "Change project settings" })
  @ApiOkResponse({ schema: toOpenApiSchema(ProjectDetailSchema) })
  update(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(UpdateProjectSchema)) body: UpdateProject,
  ): Promise<ProjectDetail> {
    return this.projects.update(workspace.id, projectId, body);
  }

  @Post(":projectId/archive")
  @HttpCode(200)
  @RequireRole("admin")
  @ApiOperation({ summary: "Archive a project: its data is kept, scheduled work stops" })
  archive(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectDetail> {
    return this.projects.setArchived(workspace.id, projectId, true, meta);
  }

  @Post(":projectId/restore")
  @HttpCode(200)
  @RequireRole("admin")
  @ApiOperation({ summary: "Restore an archived project" })
  restore(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Meta() meta: RequestMeta,
  ): Promise<ProjectDetail> {
    return this.projects.setArchived(workspace.id, projectId, false, meta);
  }

  @Delete(":projectId")
  @HttpCode(204)
  @RequireRole("admin")
  @ApiOperation({ summary: "Delete a project and all of its data" })
  delete(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.projects.delete(workspace.id, projectId, meta);
  }

  @Post(":projectId/brands")
  @RequireRole("member")
  @ApiOperation({ summary: "Add a competitor" })
  @ApiOkResponse({ schema: toOpenApiSchema(BrandEntitySchema) })
  addCompetitor(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(CompetitorInputSchema))
    body: z.output<typeof CompetitorInputSchema>,
  ): Promise<BrandEntity> {
    return this.projects.addCompetitor(workspace.id, projectId, body);
  }

  @Patch(":projectId/brands/:brandId")
  @RequireRole("member")
  @ApiOperation({ summary: "Rename a brand or change its domains and aliases" })
  @ApiOkResponse({ schema: toOpenApiSchema(BrandEntitySchema) })
  updateBrand(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("brandId", "Brand") brandId: string,
    @Body(new ZodValidationPipe(UpdateBrandSchema)) body: UpdateBrand,
  ): Promise<BrandEntity> {
    return this.projects.updateBrand(workspace.id, projectId, brandId, body);
  }

  @Delete(":projectId/brands/:brandId")
  @HttpCode(204)
  @RequireRole("member")
  @ApiOperation({ summary: "Remove a competitor" })
  deleteBrand(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("brandId", "Brand") brandId: string,
  ): Promise<void> {
    return this.projects.deleteBrand(workspace.id, projectId, brandId);
  }
}
