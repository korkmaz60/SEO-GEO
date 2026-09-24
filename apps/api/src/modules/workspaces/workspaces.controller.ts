import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { WorkspaceSchema, type Workspace } from "@seo-geo/contracts";

import { CurrentWorkspace, WorkspaceScoped } from "../../auth/decorators.js";
import type { WorkspaceContext } from "../../auth/principal.js";
import { toOpenApiSchema } from "../../common/openapi.js";
import { ProblemException } from "../../common/problem.exception.js";
import { PrismaService } from "../../database/prisma.service.js";

/**
 * Workspaces are Better Auth organizations: creating them, renaming them and managing
 * members and invitations goes through `/api/auth/organization/*`. This controller serves
 * what the product needs on top.
 */
@ApiTags("workspaces")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId")
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "A workspace and the caller's role in it" })
  @ApiOkResponse({ schema: toOpenApiSchema(WorkspaceSchema) })
  async get(@CurrentWorkspace() workspace: WorkspaceContext): Promise<Workspace> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: workspace.id },
      select: { id: true, name: true, slug: true, logo: true, createdAt: true },
    });
    if (!organization) throw ProblemException.notFound("Workspace not found.");
    return {
      ...organization,
      role: workspace.role,
      createdAt: organization.createdAt.toISOString(),
    };
  }
}
