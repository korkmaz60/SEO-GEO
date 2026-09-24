import { Body, Controller, Delete, Get, HttpCode, Patch, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateKeywordListSchema,
  KeywordListDetailSchema,
  KeywordListItemsSchema,
  KeywordListSchema,
  KeywordResearchQuoteSchema,
  KeywordResearchResultSchema,
  KeywordResearchSchema,
  RenameKeywordListSchema,
  type CreateKeywordList,
  type KeywordList,
  type KeywordListDetail,
  type KeywordListItems,
  type KeywordResearch,
  type KeywordResearchQuote,
  type KeywordResearchResult,
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
import { KeywordListsService } from "./keyword-lists.service.js";
import { KeywordResearchService } from "./keyword-research.service.js";

@ApiTags("keyword research")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/research/keywords")
export class KeywordResearchController {
  constructor(private readonly research: KeywordResearchService) {}

  @Post("quote")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Cost of a keyword research request (0 when cached)" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordResearchQuoteSchema) })
  quote(
    @Body(new ZodValidationPipe(KeywordResearchSchema)) body: KeywordResearch,
  ): Promise<KeywordResearchQuote> {
    return this.research.quote(body);
  }

  @Post()
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Keyword ideas, suggestions or related keywords with metrics" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordResearchResultSchema) })
  run(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(KeywordResearchSchema)) body: KeywordResearch,
  ): Promise<KeywordResearchResult> {
    return this.research.research(workspace.id, body);
  }
}

@ApiTags("keyword research")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/keyword-lists")
export class KeywordListsController {
  constructor(private readonly lists: KeywordListsService) {}

  @Get()
  @ApiOperation({ summary: "Saved keyword lists" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ data: z.array(KeywordListSchema) })) })
  async list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<{ data: KeywordList[] }> {
    return { data: await this.lists.list(workspace.id) };
  }

  @Post()
  @RequireRole("member")
  @ApiOperation({ summary: "Create a keyword list, optionally with keywords" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordListSchema) })
  create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(CreateKeywordListSchema)) body: CreateKeywordList,
  ): Promise<KeywordList> {
    return this.lists.create(workspace.id, body, principal.user.id);
  }

  @Get(":listId")
  @ApiOperation({ summary: "A keyword list with the latest known metrics" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordListDetailSchema) })
  detail(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("listId", "Keyword list") listId: string,
  ): Promise<KeywordListDetail> {
    return this.lists.detail(workspace.id, listId);
  }

  @Patch(":listId")
  @RequireRole("member")
  @ApiOperation({ summary: "Rename a keyword list" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordListSchema) })
  rename(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("listId", "Keyword list") listId: string,
    @Body(new ZodValidationPipe(RenameKeywordListSchema)) body: { name: string },
  ): Promise<KeywordList> {
    return this.lists.rename(workspace.id, listId, body.name);
  }

  @Delete(":listId")
  @HttpCode(204)
  @RequireRole("member")
  @ApiOperation({ summary: "Delete a keyword list" })
  delete(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("listId", "Keyword list") listId: string,
  ): Promise<void> {
    return this.lists.delete(workspace.id, listId);
  }

  @Post(":listId/items")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Add keywords to a list" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordListSchema) })
  addItems(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("listId", "Keyword list") listId: string,
    @Body(new ZodValidationPipe(KeywordListItemsSchema)) body: KeywordListItems,
  ): Promise<KeywordList> {
    return this.lists.addItems(workspace.id, listId, body.items);
  }

  @Post(":listId/items/delete")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Remove keywords from a list" })
  @ApiOkResponse({ schema: toOpenApiSchema(KeywordListSchema) })
  removeItems(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("listId", "Keyword list") listId: string,
    @Body(new ZodValidationPipe(KeywordListItemsSchema)) body: KeywordListItems,
  ): Promise<KeywordList> {
    return this.lists.removeItems(workspace.id, listId, body.items);
  }
}
