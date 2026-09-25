import { HttpStatus, Injectable, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ErrorCode,
  WorkspaceRoleSchema,
  hasWorkspaceRole,
  type WorkspaceRole,
} from "@seo-geo/contracts";
import { z } from "zod";

import { ProblemException } from "../common/problem.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { REQUIRED_ROLE } from "./metadata.js";
import type { AuthenticatedRequest } from "./principal.js";

const WorkspaceIdSchema = z.uuid();

/**
 * Resolves `:workspaceId` from the route, checks membership and the required role, and
 * stores the workspace on the request. Non-members get 404 so that IDs cannot be probed.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) throw new Error("WorkspaceGuard needs an authenticated request");

    const workspaceId = WorkspaceIdSchema.safeParse(request.params.workspaceId);
    if (!workspaceId.success) throw ProblemException.notFound("Workspace not found.");
    // A workspace API key sees no other workspace.
    const boundTo = principal.apiKey?.workspaceId;
    if (boundTo && boundTo !== workspaceId.data) {
      throw ProblemException.notFound("Workspace not found.");
    }

    const member = await this.prisma.member.findUnique({
      where: {
        organizationId_userId: { organizationId: workspaceId.data, userId: principal.user.id },
      },
      select: { role: true },
    });
    const role = WorkspaceRoleSchema.safeParse(member?.role);
    if (!role.success) throw ProblemException.notFound("Workspace not found.");

    const required =
      this.reflector.getAllAndOverride<WorkspaceRole | undefined>(REQUIRED_ROLE, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "viewer";
    if (!hasWorkspaceRole(role.data, required)) {
      throw new ProblemException({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.Forbidden,
        detail: `This action needs the ${required} role or higher.`,
      });
    }

    request.workspace = { id: workspaceId.data, role: role.data };
    return true;
  }
}
