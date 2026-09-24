import { Body, Controller, Get, HttpCode, Patch, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  DeleteTrackedKeywordsSchema,
  KeywordDetailSchema,
  RankHistoryQuerySchema,
  RankTrackerDataSchema,
  TrackKeywordsQuoteSchema,
  TrackKeywordsResultSchema,
  TrackKeywordsSchema,
  UpdateTrackedKeywordSchema,
  type DeleteTrackedKeywords,
  type KeywordDetail,
  type RankTrackerData,
  type TrackKeywords,
  type TrackKeywordsQuote,
  type TrackKeywordsResult,
  type UpdateTrackedKeyword,
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
import { RankTrackerService } from "./rank-tracker.service.js";

type HistoryQuery = z.output<typeof RankHistoryQuerySchema>;

@ApiTags("rank tracker")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/projects/:projectId/rank-tracker")
export class RankTrackerController {
  constructor(private readonly rankTracker: RankTrackerService) {}

  @Get()
  @ApiOperation({ summary: "Tracked keywords with positions, changes and the project summary" })
  @ApiOkResponse({ schema: toOpenApiSchema(RankTrackerDataSchema) })
  data(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Query(new ZodValidationPipe(RankHistoryQuerySchema)) query: HistoryQuery,
  ): Promise<RankTrackerData> {
    return this.rankTracker.data(workspace.id, projectId, query.days);
  }

  @Post("keywords/quote")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Preview adding keywords: duplicates, invalid entries and costs" })
  @ApiOkResponse({ schema: toOpenApiSchema(TrackKeywordsQuoteSchema) })
  quote(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(TrackKeywordsSchema)) body: TrackKeywords,
  ): Promise<TrackKeywordsQuote> {
    return this.rankTracker.quote(workspace.id, projectId, body);
  }

  @Post("keywords")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Track keywords; they are checked right away and then on schedule" })
  @ApiOkResponse({ schema: toOpenApiSchema(TrackKeywordsResultSchema) })
  track(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(TrackKeywordsSchema)) body: TrackKeywords,
  ): Promise<TrackKeywordsResult> {
    return this.rankTracker.track(workspace.id, projectId, body, principal.user.id);
  }

  @Post("keywords/delete")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Stop tracking keywords and delete their history" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ deleted: z.int() })) })
  async remove(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @Body(new ZodValidationPipe(DeleteTrackedKeywordsSchema)) body: DeleteTrackedKeywords,
  ): Promise<{ deleted: number }> {
    return { deleted: await this.rankTracker.remove(workspace.id, projectId, body.ids) };
  }

  @Get("keywords/:keywordId")
  @ApiOperation({ summary: "A keyword's position history, competitors and latest SERP" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordDetailSchema) })
  detail(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("keywordId", "Keyword") keywordId: string,
    @Query(new ZodValidationPipe(RankHistoryQuerySchema)) query: HistoryQuery,
  ): Promise<KeywordDetail> {
    return this.rankTracker.detail(workspace.id, projectId, keywordId, query.days);
  }

  @Patch("keywords/:keywordId")
  @HttpCode(204)
  @RequireRole("member")
  @ApiOperation({ summary: "Change a keyword's tags, target URL or check frequency" })
  update(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
    @IdParam("keywordId", "Keyword") keywordId: string,
    @Body(new ZodValidationPipe(UpdateTrackedKeywordSchema)) body: UpdateTrackedKeyword,
  ): Promise<void> {
    return this.rankTracker.update(workspace.id, projectId, keywordId, body);
  }

  @Post("check")
  @HttpCode(202)
  @RequireRole("member")
  @ApiOperation({ summary: "Check due keywords now instead of at the next hourly run" })
  checkNow(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("projectId", "Project") projectId: string,
  ): Promise<void> {
    return this.rankTracker.checkNow(workspace.id, projectId);
  }
}
