import { Inject, Injectable } from "@nestjs/common";
import {
  ApiScopeSchema,
  type CreateWorkspaceApiKey,
  type CreatedWorkspaceApiKey,
  type WorkspaceApiKey,
  type WorkspaceApiKeyList,
} from "@seo-geo/contracts";
import type { Apikey, WorkspaceApiKey as WorkspaceApiKeyRow } from "@seo-geo/db";

import { AuditService } from "../audit/audit.service.js";
import { AUTH } from "../auth/auth.tokens.js";
import type { Auth } from "../auth/auth.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { ProblemException } from "../common/problem.exception.js";
import type { RequestMeta } from "../common/request-meta.js";
import { PrismaService } from "../database/prisma.service.js";

const DAY_SECONDS = 24 * 60 * 60;

type Creator = { id: string; name: string; email: string };

const canManageAll = (workspace: WorkspaceContext) =>
  workspace.role === "owner" || workspace.role === "admin";

/**
 * Workspace-bound API keys: Better Auth keys that act as their creator, limited to one
 * workspace and to scopes (`workspace_api_key`). Owners and admins see and revoke every key
 * of the workspace; others their own.
 */
@Injectable()
export class WorkspaceApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly audit: AuditService,
  ) {}

  async list(workspace: WorkspaceContext, userId: string): Promise<WorkspaceApiKeyList> {
    const rows = await this.prisma.workspaceApiKey.findMany({
      where: {
        workspaceId: workspace.id,
        ...(canManageAll(workspace) ? {} : { key: { referenceId: userId } }),
      },
      include: { key: true },
      orderBy: { createdAt: "desc" },
    });
    const creators = await this.creators(rows.map((row) => row.key.referenceId));
    return { data: rows.map((row) => toWorkspaceApiKey(row, creators, userId)) };
  }

  async create(
    workspace: WorkspaceContext,
    userId: string,
    input: CreateWorkspaceApiKey,
    meta: RequestMeta,
  ): Promise<CreatedWorkspaceApiKey> {
    const created = await this.auth.api.createApiKey({
      body: {
        name: input.name,
        userId,
        expiresIn: input.expiresInDays === null ? null : input.expiresInDays * DAY_SECONDS,
        // Shown on the account page; access is decided by `workspace_api_key` alone.
        metadata: { workspaceId: workspace.id, scopes: input.scopes },
      },
    });
    let row: WorkspaceApiKeyRow & { key: Apikey };
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const bound = await tx.workspaceApiKey.create({
          data: { keyId: created.id, workspaceId: workspace.id, scopes: input.scopes },
          include: { key: true },
        });
        await this.audit.record(
          {
            workspaceId: workspace.id,
            action: "api_key.created",
            target: { type: "api_key", id: created.id },
            metadata: { name: input.name, scopes: input.scopes },
            meta,
          },
          tx,
        );
        return bound;
      });
    } catch (error) {
      await this.prisma.apikey.deleteMany({ where: { id: created.id } });
      throw error;
    }
    const creators = await this.creators([userId]);
    return { ...toWorkspaceApiKey(row, creators, userId), key: created.key };
  }

  async revoke(
    workspace: WorkspaceContext,
    userId: string,
    keyId: string,
    meta: RequestMeta,
  ): Promise<void> {
    const row = await this.prisma.workspaceApiKey.findFirst({
      where: { keyId, workspaceId: workspace.id },
      include: { key: true },
    });
    if (!row || (!canManageAll(workspace) && row.key.referenceId !== userId)) {
      throw ProblemException.notFound("API key not found.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.apikey.delete({ where: { id: keyId } });
      await this.audit.record(
        {
          workspaceId: workspace.id,
          action: "api_key.revoked",
          target: { type: "api_key", id: keyId },
          metadata: { name: row.key.name ?? "" },
          meta,
        },
        tx,
      );
    });
  }

  private async creators(ids: readonly string[]): Promise<Map<string, Creator>> {
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true, email: true },
    });
    return new Map(users.map((user) => [user.id, user]));
  }
}

function toWorkspaceApiKey(
  row: WorkspaceApiKeyRow & { key: Apikey },
  creators: ReadonlyMap<string, Creator>,
  userId: string,
): WorkspaceApiKey {
  const creator = creators.get(row.key.referenceId);
  return {
    id: row.keyId,
    name: row.key.name ?? "",
    start: row.key.start,
    scopes: row.scopes.flatMap((scope) => {
      const parsed = ApiScopeSchema.safeParse(scope);
      return parsed.success ? [parsed.data] : [];
    }),
    createdBy: creator ?? { id: row.key.referenceId, name: "", email: "" },
    own: row.key.referenceId === userId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.key.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.key.lastRequest?.toISOString() ?? null,
  };
}
