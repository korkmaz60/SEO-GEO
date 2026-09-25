import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  AiCostQuoteRequestSchema,
  AiCostQuoteSchema,
  AiModelsSchema,
  AiPromptDetailSchema,
  AiPromptListSchema,
  AiPromptsQuerySchema,
  AiRangeQuerySchema,
  AiSettingsSchema,
  AiSourcesSchema,
  AiVisibilitySummarySchema,
  CreatePromptsResultSchema,
  CreatePromptsSchema,
  DeletePromptsSchema,
  ModelPlatformSchema,
  UpdateAiSettingsSchema,
  UpdatePromptSchema,
  type AiCostQuote,
  type AiCostQuoteRequest,
  type AiModels,
  type AiPromptDetail,
  type AiPromptList,
  type AiPromptsQuery,
  type AiSettings,
  type AiSources,
  type AiVisibilitySummary,
  type CreatePrompts,
  type CreatePromptsResult,
  type ModelPlatform,
  type UpdateAiSettings,
  type UpdatePrompt,
} from "@seo-geo/contracts";
import { z } from "zod";

import {
  CurrentPrincipal,
  CurrentWorkspace,
  RequireRole,
  RequireScope,
  WorkspaceScoped,
} from "../auth/decorators.js";
import type { Principal, WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { Meta, type RequestMeta } from "../common/request-meta.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { AiReadModelService } from "./ai-read-model.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { PromptsService } from "./prompts.service.js";

type RangeQuery = z.output<typeof AiRangeQuerySchema>;

@ApiTags("ai visibility")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/projects/:projectId/ai-visibility")
export class AiVisibilityController {
  constructor(
    private readonly reports: AiReadModelService,
    private readonly settings: AiSettingsService,
    private readonly prompts: PromptsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "AI visibility of the own brand and competitors: scores, platforms, trend, sources",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(AiVisibilitySummarySchema) })
  summary(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Query(new ZodValidationPipe(AiRangeQuerySchema)) query: RangeQuery,
  ): Promise<AiVisibilitySummary> {
    return this.reports.summary(workspace.id, projectId, query.days);
  }

  @Get("sources")
  @ApiOperation({ summary: "Domains and own pages that AI answers cite" })
  @ApiOkResponse({ schema: toOpenApiSchema(AiSourcesSchema) })
  sources(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Query(new ZodValidationPipe(AiRangeQuerySchema)) query: RangeQuery,
  ): Promise<AiSources> {
    return this.reports.sources(workspace.id, projectId, query.days);
  }

  @Get("settings")
  @ApiOperation({ summary: "Platforms, schedule, samples and models the prompts are asked with" })
  @ApiOkResponse({ schema: toOpenApiSchema(AiSettingsSchema) })
  getSettings(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<AiSettings> {
    return this.settings.get(workspace.id, projectId);
  }

  @Patch("settings")
  @RequireRole("member")
  @ApiOperation({ summary: "Change platforms, schedule, samples, models or sentiment" })
  @ApiOkResponse({ schema: toOpenApiSchema(AiSettingsSchema) })
  updateSettings(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(UpdateAiSettingsSchema)) body: UpdateAiSettings,
    @Meta() meta: RequestMeta,
  ): Promise<AiSettings> {
    return this.settings.update(workspace.id, projectId, body, meta);
  }

  @Post("settings/quote")
  @RequireScope("read")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Estimated cost per period and month of the saved or given settings" })
  @ApiOkResponse({ schema: toOpenApiSchema(AiCostQuoteSchema) })
  quote(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(AiCostQuoteRequestSchema)) body: AiCostQuoteRequest,
  ): Promise<AiCostQuote> {
    return this.settings.quote(workspace.id, projectId, body);
  }

  @Get("models/:platform")
  @RequireRole("member")
  @ApiOperation({ summary: "Models Claude or Perplexity can be asked with, cheapest first" })
  @ApiOkResponse({ schema: toOpenApiSchema(AiModelsSchema) })
  models(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Param("platform", new ZodValidationPipe(z.string().toUpperCase().pipe(ModelPlatformSchema)))
    platform: ModelPlatform,
  ): Promise<AiModels> {
    return this.settings.listModels(workspace.id, projectId, platform);
  }

  @Get("prompts")
  @ApiOperation({ summary: "Prompts with the own brand's visibility and the latest answers" })
  @ApiOkResponse({ schema: toOpenApiSchema(AiPromptListSchema) })
  listPrompts(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Query(new ZodValidationPipe(AiPromptsQuerySchema)) query: AiPromptsQuery,
  ): Promise<AiPromptList> {
    return this.reports.prompts(workspace.id, projectId, query);
  }

  @Post("prompts")
  @RequireScope("run:paid")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Add prompts; they are asked right away and then on schedule" })
  @ApiOkResponse({ schema: toOpenApiSchema(CreatePromptsResultSchema) })
  createPrompts(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(CreatePromptsSchema)) body: CreatePrompts,
  ): Promise<CreatePromptsResult> {
    return this.prompts.create(workspace.id, projectId, body, principal.user.id);
  }

  @Post("prompts/delete")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Delete prompts and their answers" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ deleted: z.int() })) })
  async deletePrompts(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(DeletePromptsSchema)) body: z.output<typeof DeletePromptsSchema>,
  ): Promise<{ deleted: number }> {
    return { deleted: await this.prompts.remove(workspace.id, projectId, body.ids) };
  }

  @Get("prompts/:promptId")
  @ApiOperation({ summary: "A prompt's answers with highlighted mentions and citations" })
  @ApiOkResponse({ schema: toOpenApiSchema(AiPromptDetailSchema) })
  prompt(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("promptId", "Prompt") promptId: string,
    @Query(new ZodValidationPipe(AiRangeQuerySchema)) query: RangeQuery,
  ): Promise<AiPromptDetail> {
    return this.reports.detail(workspace.id, projectId, promptId, query.days);
  }

  @Patch("prompts/:promptId")
  @HttpCode(204)
  @RequireRole("member")
  @ApiOperation({ summary: "Change a prompt's tags or pause it" })
  updatePrompt(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("promptId", "Prompt") promptId: string,
    @Body(new ZodValidationPipe(UpdatePromptSchema)) body: UpdatePrompt,
  ): Promise<void> {
    return this.prompts.update(workspace.id, projectId, promptId, body);
  }

  @Post("run")
  @RequireScope("run:paid")
  @HttpCode(202)
  @RequireRole("member")
  @ApiOperation({ summary: "Ask the prompts that are due now instead of at the next hourly run" })
  run(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<void> {
    return this.prompts.runNow(workspace.id, projectId);
  }
}
