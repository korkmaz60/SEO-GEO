import { HttpStatus, Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import {
  ErrorCode,
  type Provider,
  type ProviderCredential,
  type SaveDataForSeoCredential,
} from "@seo-geo/contracts";
import type { DataForSeoClient } from "@seo-geo/dataforseo";
import type { ProviderCredential as CredentialRow } from "@seo-geo/db";
import { z } from "zod";

import { AuditService } from "../audit/audit.service.js";
import { ProblemException } from "../common/problem.exception.js";
import type { RequestMeta } from "../common/request-meta.js";
import { iso } from "../common/serialize.js";
import { SecretBoxService } from "../crypto/secret-box.js";
import { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { DataForSeoGateway, type DataForSeoLogin } from "./dataforseo.gateway.js";

const DetailsSchema = z.object({
  login: z.string().optional(),
  balanceUsd: z.number().optional(),
});

const DataForSeoSecretSchema = z.object({ login: z.string(), password: z.string() });

export interface DataForSeoClientOptions {
  /** Per attempt; defaults to 60 seconds. */
  timeoutMs?: number;
  /** Defaults to 2. */
  maxRetries?: number;
}

/** Associated data that ties a ciphertext to its workspace and provider. */
function secretContext(workspaceId: string, provider: Provider): string {
  return `provider_credential:${workspaceId}:${provider}`;
}

export function toCredential(row: CredentialRow): ProviderCredential {
  const details = DetailsSchema.safeParse(row.details);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    status: row.status,
    details: details.success ? details.data : {},
    lastError: row.lastError,
    lastVerifiedAt: iso(row.lastVerifiedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

@Injectable()
export class CredentialsService implements OnModuleInit {
  private readonly logger = new Logger("Credentials");

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBoxService,
    private readonly dataForSeo: DataForSeoGateway,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly registry: TaskRegistry,
  ) {}

  onModuleInit(): void {
    // Keeps the status and balance current, and notices revoked keys.
    this.registry.registerScheduledJob({
      name: "credentials.reverify",
      cron: "15 3 * * *",
      handler: (signal) => this.reverifyAll(signal),
    });
  }

  async list(workspaceId: string): Promise<ProviderCredential[]> {
    const rows = await this.prisma.providerCredential.findMany({
      where: { workspaceId },
      orderBy: { provider: "asc" },
    });
    return rows.map(toCredential);
  }

  /** Verifies the credentials with DataForSEO and stores them only when they work. */
  async saveDataForSeo(
    workspaceId: string,
    input: SaveDataForSeoCredential,
    meta: RequestMeta,
  ): Promise<ProviderCredential> {
    const result = await this.dataForSeo.verify(input);
    if (result.status === "rejected") {
      throw new ProblemException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.ProviderError,
        detail: `DataForSEO rejected these credentials: ${result.message}`,
      });
    }
    if (result.status === "unreachable") {
      throw new ProblemException({
        status: HttpStatus.BAD_GATEWAY,
        code: ErrorCode.ProviderError,
        detail: `DataForSEO could not be reached; nothing was saved. ${result.message}`,
      });
    }

    const sealed = this.secrets.seal(
      JSON.stringify({ login: input.login, password: input.password }),
      secretContext(workspaceId, "DATAFORSEO"),
    );
    const data = {
      label: "DataForSEO",
      encryptedSecret: sealed.ciphertext,
      keyVersion: sealed.keyVersion,
      status: "VALID" as const,
      details: { login: result.login, balanceUsd: result.balanceUsd },
      lastError: null,
      lastVerifiedAt: new Date(),
    };
    const row = await this.prisma.providerCredential.upsert({
      where: { workspaceId_provider: { workspaceId, provider: "DATAFORSEO" } },
      create: { workspaceId, provider: "DATAFORSEO", createdBy: meta.userId, ...data },
      update: data,
    });
    await this.audit.record({
      workspaceId,
      action: "credential.saved",
      target: { type: "provider_credential", id: row.id },
      metadata: { provider: "DATAFORSEO", login: result.login },
      meta,
    });
    return toCredential(row);
  }

  async verify(workspaceId: string, credentialId: string): Promise<ProviderCredential> {
    return toCredential(await this.reverify(await this.find(workspaceId, credentialId)));
  }

  async delete(workspaceId: string, credentialId: string, meta: RequestMeta): Promise<void> {
    const row = await this.find(workspaceId, credentialId);
    await this.prisma.providerCredential.delete({ where: { id: row.id } });
    await this.audit.record({
      workspaceId,
      action: "credential.deleted",
      target: { type: "provider_credential", id: row.id },
      metadata: { provider: row.provider },
      meta,
    });
  }

  /** A DataForSEO client with the workspace's stored credentials, for data requests. */
  async dataForSeoClient(
    workspaceId: string,
    options: DataForSeoClientOptions = {},
  ): Promise<DataForSeoClient> {
    const client = await this.findDataForSeoClient(workspaceId, options);
    if (!client) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.ProviderError,
        detail: "Connect a working DataForSEO account in the workspace settings first.",
      });
    }
    return client;
  }

  /** Like {@link dataForSeoClient}, but `null` when there are no working credentials. */
  async findDataForSeoClient(
    workspaceId: string,
    options: DataForSeoClientOptions = {},
  ): Promise<DataForSeoClient | null> {
    const row = await this.prisma.providerCredential.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: "DATAFORSEO" } },
    });
    if (!row || row.status === "INVALID") return null;
    return this.dataForSeo.client(this.openDataForSeo(row), {
      timeoutMs: options.timeoutMs ?? 60_000,
      maxRetries: options.maxRetries ?? 2,
    });
  }

  /** Whether the workspace has DataForSEO credentials that are not known to be invalid. */
  async hasDataForSeo(workspaceId: string): Promise<boolean> {
    const row = await this.prisma.providerCredential.findUnique({
      where: { workspaceId_provider: { workspaceId, provider: "DATAFORSEO" } },
      select: { status: true },
    });
    return row !== null && row.status !== "INVALID";
  }

  /** Re-checks every stored DataForSEO credential; used by the daily job. */
  async reverifyAll(signal?: AbortSignal): Promise<void> {
    const rows = await this.prisma.providerCredential.findMany({
      where: { provider: "DATAFORSEO" },
      orderBy: { id: "asc" },
    });
    for (const row of rows) {
      if (signal?.aborted) return;
      try {
        await this.reverify(row);
      } catch (error) {
        this.logger.warn(`Could not re-verify credential ${row.id}: ${String(error)}`);
      }
    }
  }

  private async reverify(row: CredentialRow): Promise<CredentialRow> {
    const result = await this.dataForSeo.verify(this.openDataForSeo(row));
    const now = new Date();
    switch (result.status) {
      case "valid":
        return this.prisma.providerCredential.update({
          where: { id: row.id },
          data: {
            status: "VALID",
            details: { login: result.login, balanceUsd: result.balanceUsd },
            lastError: null,
            lastVerifiedAt: now,
          },
        });
      case "rejected": {
        const updated = await this.prisma.providerCredential.update({
          where: { id: row.id },
          data: { status: "INVALID", lastError: result.message, lastVerifiedAt: now },
        });
        if (row.status !== "INVALID") {
          await this.notifications.notifyRoles(row.workspaceId, ["owner", "admin"], {
            type: "credential.invalid",
            title: "DataForSEO no longer accepts the stored credentials",
            body: result.message,
            data: { provider: row.provider },
          });
        }
        return updated;
      }
      case "unreachable":
        // Keep the last known status; a transient outage is not a revoked key.
        return this.prisma.providerCredential.update({
          where: { id: row.id },
          data: { lastError: result.message },
        });
    }
  }

  private openDataForSeo(row: CredentialRow): DataForSeoLogin {
    const plaintext = this.secrets.open(
      row.encryptedSecret,
      row.keyVersion,
      secretContext(row.workspaceId, row.provider),
    );
    return DataForSeoSecretSchema.parse(JSON.parse(plaintext));
  }

  private async find(workspaceId: string, credentialId: string): Promise<CredentialRow> {
    const row = await this.prisma.providerCredential.findFirst({
      where: { id: credentialId, workspaceId },
    });
    if (!row) throw ProblemException.notFound("Credential not found.");
    return row;
  }
}
