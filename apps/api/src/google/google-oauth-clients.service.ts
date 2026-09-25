import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  type GoogleOAuthClient,
  type GoogleOAuthClientSource,
  type SaveGoogleOAuthClient,
} from "@seo-geo/contracts";
import type { GoogleConnection, GoogleOAuthClient as ClientRow, Prisma } from "@seo-geo/db";

import { AuditService } from "../audit/audit.service.js";
import { ProblemException } from "../common/problem.exception.js";
import type { RequestMeta } from "../common/request-meta.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig, GoogleOAuthConfig } from "../config/env.js";
import { SecretBoxService } from "../crypto/secret-box.js";
import { PrismaService } from "../database/prisma.service.js";
import { GoogleApi } from "./google-api.js";

/** An OAuth client with its secret, ready for requests to Google. */
export interface ResolvedGoogleClient extends GoogleOAuthConfig {
  source: GoogleOAuthClientSource;
}

/** Stored on connections whose client was replaced or removed. */
export const CLIENT_GONE =
  "The Google OAuth client that connected this account was replaced or removed; connect the account again.";

/** Associated data that ties a secret to its workspace. */
function secretContext(workspaceId: string): string {
  return `google_oauth_client:${workspaceId}`;
}

/** Google's answers to a client check, in words people can act on. */
function rejection(code: string, message: string, redirectUri: string): string {
  switch (code) {
    case "invalid_client":
      return "Google does not know this client ID and secret. Copy both again from the client in Google Cloud.";
    case "redirect_uri_mismatch":
      return `Add ${redirectUri} as an authorized redirect URI of the client in Google Cloud.`;
    case "unauthorized_client":
      return "This client may not use the authorization code flow. Create a client of the Web application type.";
    default:
      return `Google rejected this client: ${message}`;
  }
}

/**
 * Google OAuth clients: a workspace's own, entered in the app and stored encrypted, and the
 * installation's (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) as the fallback. Refresh tokens
 * only work with the client that issued them, so each connection keeps its client ID.
 */
@Injectable()
export class GoogleOAuthClientsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBoxService,
    private readonly google: GoogleApi,
    private readonly audit: AuditService,
  ) {}

  /** The redirect URI every client needs, derived from WEB_URL. */
  get redirectUri(): string {
    return this.config.googleRedirectUri;
  }

  /** The installation's client, if GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. */
  get instance(): ResolvedGoogleClient | null {
    return this.config.google ? { ...this.config.google, source: "INSTANCE" } : null;
  }

  /** The client new connections of a workspace use: its own, else the installation's. */
  async forWorkspace(workspaceId: string): Promise<ResolvedGoogleClient | null> {
    const row = await this.prisma.googleOAuthClient.findUnique({ where: { workspaceId } });
    return row ? this.open(row) : this.instance;
  }

  /**
   * The client that issued a connection's tokens, the only one that can refresh them; `null`
   * when it is no longer configured. Connections made before workspaces had clients of their
   * own (`oauthClientId` is `null`) belong to the installation's client.
   */
  async forConnection(
    connection: Pick<GoogleConnection, "workspaceId" | "oauthClientId">,
  ): Promise<ResolvedGoogleClient | null> {
    const instance = this.instance;
    if (connection.oauthClientId === null) return instance;
    const row = await this.prisma.googleOAuthClient.findUnique({
      where: { workspaceId: connection.workspaceId },
    });
    if (row?.clientId === connection.oauthClientId) return this.open(row);
    return instance?.clientId === connection.oauthClientId ? instance : null;
  }

  /** The client new connections use, without its secret. */
  async describe(workspaceId: string): Promise<GoogleOAuthClient | null> {
    const row = await this.prisma.googleOAuthClient.findUnique({ where: { workspaceId } });
    if (row) {
      return {
        source: "WORKSPACE",
        clientId: row.clientId,
        verifiedAt: row.verifiedAt.toISOString(),
      };
    }
    const instance = this.instance;
    return instance ? { source: "INSTANCE", clientId: instance.clientId, verifiedAt: null } : null;
  }

  /**
   * Checks the client with Google and stores it encrypted. Accounts connected with a client it
   * replaces must connect again.
   */
  async save(workspaceId: string, input: SaveGoogleOAuthClient, meta: RequestMeta): Promise<void> {
    const client = { ...input, redirectUri: this.redirectUri };
    let rejected: Awaited<ReturnType<GoogleApi["checkClient"]>>;
    try {
      rejected = await this.google.checkClient(client);
    } catch {
      throw new ProblemException({
        status: HttpStatus.BAD_GATEWAY,
        code: ErrorCode.ProviderError,
        detail: "Google could not be reached; nothing was saved. Try again in a moment.",
      });
    }
    if (rejected) {
      throw new ProblemException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.ProviderError,
        detail: rejection(rejected.code, rejected.message, this.redirectUri),
      });
    }

    const sealed = this.secrets.seal(input.clientSecret, secretContext(workspaceId));
    const data = {
      clientId: input.clientId,
      encryptedSecret: sealed.ciphertext,
      keyVersion: sealed.keyVersion,
      verifiedAt: new Date(),
    };
    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.googleOAuthClient.findUnique({ where: { workspaceId } });
      await tx.googleOAuthClient.upsert({
        where: { workspaceId },
        create: { workspaceId, createdBy: meta.userId, ...data },
        update: data,
      });
      if (previous && previous.clientId !== input.clientId) {
        await this.orphanConnections(tx, workspaceId, previous.clientId);
      }
    });
    await this.audit.record({
      workspaceId,
      action: "google.client_saved",
      target: { type: "google_oauth_client", id: workspaceId },
      metadata: { clientId: input.clientId },
      meta,
    });
  }

  /** Removes the workspace's client; the installation's applies again, if there is one. */
  async remove(workspaceId: string, meta: RequestMeta): Promise<void> {
    const row = await this.prisma.googleOAuthClient.findUnique({ where: { workspaceId } });
    if (!row)
      throw ProblemException.notFound("This workspace has no Google OAuth client of its own.");
    await this.prisma.$transaction(async (tx) => {
      await tx.googleOAuthClient.delete({ where: { workspaceId } });
      await this.orphanConnections(tx, workspaceId, row.clientId);
    });
    await this.audit.record({
      workspaceId,
      action: "google.client_removed",
      target: { type: "google_oauth_client", id: workspaceId },
      metadata: { clientId: row.clientId },
      meta,
    });
  }

  /**
   * Marks the connections a client issued as needing a new connection: their tokens cannot be
   * refreshed without it. Nothing changes when the installation uses the same client.
   */
  private async orphanConnections(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    clientId: string,
  ): Promise<void> {
    if (this.instance?.clientId === clientId) return;
    await tx.googleConnection.updateMany({
      where: { workspaceId, oauthClientId: clientId, status: "ACTIVE" },
      data: { status: "REVOKED", lastError: CLIENT_GONE },
    });
  }

  private open(row: ClientRow): ResolvedGoogleClient {
    return {
      source: "WORKSPACE",
      clientId: row.clientId,
      clientSecret: this.secrets.open(
        row.encryptedSecret,
        row.keyVersion,
        secretContext(row.workspaceId),
      ),
      redirectUri: this.redirectUri,
    };
  }
}
