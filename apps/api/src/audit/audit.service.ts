import { Injectable } from "@nestjs/common";
import type { Prisma } from "@seo-geo/db";

import type { RequestMeta } from "../common/request-meta.js";
import { PrismaService } from "../database/prisma.service.js";

export interface AuditEvent {
  workspaceId: string;
  /** e.g. `project.created`, `credential.saved`. */
  action: string;
  target?: { type: string; id: string };
  metadata?: Prisma.InputJsonObject;
  meta?: RequestMeta;
}

/** Records security-relevant actions. Never put secrets in `metadata`. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(event: AuditEvent, db: Prisma.TransactionClient = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        workspaceId: event.workspaceId,
        action: event.action,
        actorUserId: event.meta?.userId ?? null,
        actorApiKeyId: event.meta?.apiKeyId ?? null,
        targetType: event.target?.type ?? null,
        targetId: event.target?.id ?? null,
        metadata: event.metadata ?? {},
        ip: event.meta?.ip ?? null,
        userAgent: event.meta?.userAgent ?? null,
      },
    });
  }
}
