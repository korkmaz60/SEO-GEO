import { Injectable } from "@nestjs/common";
import type { NotificationValue, WorkspaceRole } from "@seo-geo/contracts";
import type { Prisma } from "@seo-geo/db";

import { PrismaService } from "../database/prisma.service.js";

export interface NotificationInput {
  type: string;
  /** English fallback; the web app renders localized text from `type` and `data`. */
  title: string;
  body?: string;
  data?: Record<string, NotificationValue>;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Notifies every member of the workspace with one of `roles`. */
  async notifyRoles(
    workspaceId: string,
    roles: WorkspaceRole[],
    notification: NotificationInput,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const members = await db.member.findMany({
      where: { organizationId: workspaceId, role: { in: roles } },
      select: { userId: true },
    });
    if (members.length === 0) return;
    await db.notification.createMany({
      data: members.map(({ userId }) => ({
        workspaceId,
        userId,
        type: notification.type,
        title: notification.title,
        body: notification.body ?? null,
        data: notification.data ?? {},
        link: notification.link ?? null,
      })),
    });
  }

  /**
   * Like {@link notifyRoles}, but only when the workspace has had no notification of this
   * type since `since`; for problems that recur on every run (e.g. once a day).
   */
  async notifyRolesOnce(
    workspaceId: string,
    roles: WorkspaceRole[],
    notification: NotificationInput,
    since: Date,
  ): Promise<boolean> {
    const existing = await this.prisma.notification.findFirst({
      where: { workspaceId, type: notification.type, createdAt: { gte: since } },
      select: { id: true },
    });
    if (existing) return false;
    await this.notifyRoles(workspaceId, roles, notification);
    return true;
  }
}
