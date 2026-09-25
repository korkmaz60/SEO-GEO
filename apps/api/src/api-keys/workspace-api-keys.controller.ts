import { Body, Controller, Delete, Get, HttpCode, Post } from "@nestjs/common";
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  CreateWorkspaceApiKeySchema,
  CreatedWorkspaceApiKeySchema,
  WorkspaceApiKeyListSchema,
  type CreateWorkspaceApiKey,
  type CreatedWorkspaceApiKey,
  type WorkspaceApiKeyList,
} from "@seo-geo/contracts";

import {
  CurrentPrincipal,
  CurrentWorkspace,
  SessionOnly,
  WorkspaceScoped,
} from "../auth/decorators.js";
import type { Principal, WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { Meta, type RequestMeta } from "../common/request-meta.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { WorkspaceApiKeysService } from "./workspace-api-keys.service.js";

/** Keys for scripts, integrations and MCP clients; managed only by signed-in users. */
@ApiTags("api keys")
@WorkspaceScoped()
@SessionOnly()
@Controller("workspaces/:workspaceId/api-keys")
export class WorkspaceApiKeysController {
  constructor(private readonly keys: WorkspaceApiKeysService) {}

  @Get()
  @ApiOperation({ summary: "The workspace's API keys (owners and admins see everyone's)" })
  @ApiOkResponse({ schema: toOpenApiSchema(WorkspaceApiKeyListSchema) })
  list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
  ): Promise<WorkspaceApiKeyList> {
    return this.keys.list(workspace, principal.user.id);
  }

  @Post()
  @ApiOperation({
    summary: "Create an API key for this workspace; the key is returned once",
  })
  @ApiCreatedResponse({ schema: toOpenApiSchema(CreatedWorkspaceApiKeySchema) })
  create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(CreateWorkspaceApiKeySchema)) body: CreateWorkspaceApiKey,
    @Meta() meta: RequestMeta,
  ): Promise<CreatedWorkspaceApiKey> {
    return this.keys.create(workspace, principal.user.id, body, meta);
  }

  @Delete(":keyId")
  @HttpCode(204)
  @ApiOperation({ summary: "Revoke an API key" })
  revoke(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() principal: Principal,
    @IdParam("keyId", "API key") keyId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.keys.revoke(workspace, principal.user.id, keyId, meta);
  }
}
