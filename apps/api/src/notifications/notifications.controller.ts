import { Controller, Get, HttpCode, Post } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { NotificationSchema, type Notification } from "@seo-geo/contracts";
import { z } from "zod";

import { CurrentPrincipal, CurrentWorkspace, WorkspaceScoped } from "../auth/decorators.js";
import type { Principal, WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { ProblemException } from "../common/problem.exception.js";
import { iso } from "../common/serialize.js";
import { PrismaService } from "../database/prisma.service.js";

@ApiTags("notifications")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/notifications")
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "The caller's latest notifications in this workspace" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ data: z.array(NotificationSchema) })) })
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() { user }: Principal,
  ): Promise<{ data: Notification[]; unread: number }> {
    const where = { workspaceId: workspace.id, userId: user.id };
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        body: row.body,
        link: row.link,
        readAt: iso(row.readAt),
        createdAt: iso(row.createdAt),
      })),
      unread,
    };
  }

  @Post(":notificationId/read")
  @HttpCode(204)
  @ApiOperation({ summary: "Mark a notification as read" })
  async markRead(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() { user }: Principal,
    @IdParam("notificationId", "Notification") notificationId: string,
  ): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id: notificationId, workspaceId: workspace.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.notification.count({
        where: { id: notificationId, workspaceId: workspace.id, userId: user.id },
      });
      if (!exists) throw ProblemException.notFound("Notification not found.");
    }
  }

  @Post("read-all")
  @HttpCode(204)
  @ApiOperation({ summary: "Mark all of the caller's notifications in this workspace as read" })
  async markAllRead(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @CurrentPrincipal() { user }: Principal,
  ): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { workspaceId: workspace.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
