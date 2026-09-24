import { Body, Controller, Delete, Get, HttpCode, Post, Put } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ProviderCredentialSchema,
  SaveDataForSeoCredentialSchema,
  type ProviderCredential,
  type SaveDataForSeoCredential,
} from "@seo-geo/contracts";
import { z } from "zod";

import { CurrentWorkspace, RequireRole, WorkspaceScoped } from "../auth/decorators.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { Meta, type RequestMeta } from "../common/request-meta.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { CredentialsService } from "./credentials.service.js";

@ApiTags("credentials")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/credentials")
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get()
  @ApiOperation({ summary: "Connected providers and their status; secrets are never returned" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ data: z.array(ProviderCredentialSchema) })) })
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<{ data: ProviderCredential[] }> {
    return { data: await this.credentials.list(workspace.id) };
  }

  @Put("dataforseo")
  @RequireRole("admin")
  @ApiOperation({
    summary: "Connect DataForSEO: the credentials are verified first and stored encrypted",
  })
  @ApiOkResponse({ schema: toOpenApiSchema(ProviderCredentialSchema) })
  saveDataForSeo(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(SaveDataForSeoCredentialSchema)) body: SaveDataForSeoCredential,
    @Meta() meta: RequestMeta,
  ): Promise<ProviderCredential> {
    return this.credentials.saveDataForSeo(workspace.id, body, meta);
  }

  @Post(":credentialId/verify")
  @HttpCode(200)
  @RequireRole("admin")
  @ApiOperation({ summary: "Check the stored credentials again and refresh the balance" })
  @ApiOkResponse({ schema: toOpenApiSchema(ProviderCredentialSchema) })
  verify(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("credentialId", "Credential") credentialId: string,
  ): Promise<ProviderCredential> {
    return this.credentials.verify(workspace.id, credentialId);
  }

  @Delete(":credentialId")
  @HttpCode(204)
  @RequireRole("admin")
  @ApiOperation({ summary: "Remove a provider connection" })
  delete(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("credentialId", "Credential") credentialId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    return this.credentials.delete(workspace.id, credentialId, meta);
  }
}
