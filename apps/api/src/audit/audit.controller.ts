import { Controller, Get, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuditEntrySchema, type AuditEntry } from "@seo-geo/contracts";
import { z } from "zod";

import { CurrentWorkspace, RequireRole, WorkspaceScoped } from "../auth/decorators.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { iso } from "../common/serialize.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PrismaService } from "../database/prisma.service.js";

const AuditQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** ID of the last entry of the previous page. */
  before: z.uuid().optional(),
});

@ApiTags("audit")
@WorkspaceScoped()
@RequireRole("admin")
@Controller("workspaces/:workspaceId/audit-log")
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "Security-relevant actions in the workspace, newest first" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ data: z.array(AuditEntrySchema) })) })
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(AuditQuerySchema)) query: z.output<typeof AuditQuerySchema>,
  ): Promise<{ data: AuditEntry[]; nextCursor: string | null }> {
    // UUIDv7 ids sort by creation time, so they double as a cursor.
    const rows = await this.prisma.auditLog.findMany({
      where: {
        workspaceId: workspace.id,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { id: "desc" },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const actorIds = [
      ...new Set(page.flatMap((row) => (row.actorUserId ? [row.actorUserId] : []))),
    ];
    const actors = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, email: true },
        })
      ).map((user) => [user.id, user]),
    );

    return {
      data: page.map((row) => ({
        id: row.id,
        action: row.action,
        actor: row.actorUserId ? (actors.get(row.actorUserId) ?? null) : null,
        targetType: row.targetType,
        targetId: row.targetId,
        metadata: (row.metadata ?? {}) as Record<string, unknown>,
        ip: row.ip,
        createdAt: iso(row.createdAt),
      })),
      nextCursor: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
    };
  }
}
