import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Inject, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  type GoogleConnection,
  type GoogleIntegrations,
  type GoogleProperties,
} from "@seo-geo/contracts";
import { hostMatchesDomain } from "@seo-geo/core";
import type { GoogleConnection as ConnectionRow } from "@seo-geo/db";
import { z } from "zod";

import { AuditService } from "../audit/audit.service.js";
import { ProblemException } from "../common/problem.exception.js";
import type { RequestMeta } from "../common/request-meta.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { SecretBoxService } from "../crypto/secret-box.js";
import { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { GoogleApi, GoogleApiError, type GoogleTokens } from "./google-api.js";
import { CLIENT_GONE, GoogleOAuthClientsService } from "./google-oauth-clients.service.js";
import { deleteImportedFacts } from "./imported-facts.js";

/** How long a sign-in with Google may take before its state expires. */
const STATE_TTL_MS = 10 * 60 * 1000;
/** Access tokens are refreshed this long before they expire. */
const REFRESH_LEEWAY_MS = 60 * 1000;
const STATE_CONTEXT = "google_oauth_state";

const StateSchema = z.object({
  workspaceId: z.uuid(),
  projectId: z.uuid(),
  userId: z.string(),
  /** The OAuth client the flow started with; the code only works with it. */
  clientId: z.string(),
  verifier: z.string(),
  expiresAt: z.number(),
});

const StoredTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
});

function tokenContext(workspaceId: string, googleUserId: string): string {
  return `google_connection:${workspaceId}:${googleUserId}`;
}

export function toConnection(row: ConnectionRow): GoogleConnection {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Where a project's Search Console page lives in the web app. */
async function projectPage(
  prisma: PrismaService,
  webUrl: string,
  workspaceId: string,
  projectId: string,
): Promise<string> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId },
    include: { workspace: { select: { slug: true } } },
  });
  return project
    ? `${webUrl}/${project.workspace.slug}/${project.slug}/search-console`
    : `${webUrl}/`;
}

/**
 * Google accounts connected to a workspace: the OAuth flow (authorization code with PKCE,
 * state bound to the signed-in user), encrypted token storage and refresh.
 */
@Injectable()
export class GoogleConnectionsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly google: GoogleApi,
    private readonly clients: GoogleOAuthClientsService,
    private readonly secrets: SecretBoxService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async status(workspaceId: string): Promise<GoogleIntegrations> {
    const [rows, client] = await Promise.all([
      this.prisma.googleConnection.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "asc" },
      }),
      this.clients.describe(workspaceId),
    ]);
    return {
      configured: client !== null,
      client,
      instanceClient: this.clients.instance !== null,
      redirectUri: this.clients.redirectUri,
      connections: rows.map(toConnection),
    };
  }

  /** The Google consent URL; the state carries the PKCE verifier, encrypted. */
  async authorize(
    workspaceId: string,
    projectId: string,
    userId: string,
  ): Promise<{ url: string }> {
    const client = await this.clients.forWorkspace(workspaceId);
    if (!client) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail:
          "Add a Google OAuth client first: workspace settings, Providers (or GOOGLE_CLIENT_ID on the server).",
      });
    }
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const sealed = this.secrets.seal(
      JSON.stringify({
        workspaceId,
        projectId,
        userId,
        clientId: client.clientId,
        verifier,
        expiresAt: Date.now() + STATE_TTL_MS,
      } satisfies z.infer<typeof StateSchema>),
      STATE_CONTEXT,
    );
    const state = `${sealed.keyVersion}.${Buffer.from(sealed.ciphertext).toString("base64url")}`;
    return { url: this.google.authorizationUrl(client, { state, codeChallenge: challenge }) };
  }

  /**
   * Completes the OAuth flow and returns the web page to send the browser to. Errors are
   * reported to the page as `?google=<reason>` instead of an api error page.
   */
  async callback(
    userId: string,
    query: { code?: string; state?: string; error?: string },
    meta: RequestMeta,
  ): Promise<string> {
    const state = this.openState(query.state);
    if (!state || state.userId !== userId) return `${this.config.webUrl}/?google=invalid_state`;
    const page = await projectPage(
      this.prisma,
      this.config.webUrl,
      state.workspaceId,
      state.projectId,
    );
    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: state.workspaceId, userId } },
    });
    if (!member || !["owner", "admin"].includes(member.role)) return `${page}?google=forbidden`;
    if (query.error || !query.code) return `${page}?google=${query.error ? "denied" : "failed"}`;
    // The client was changed while the person was at Google: the code only works with the old.
    const client = await this.clients.forWorkspace(state.workspaceId);
    if (!client || client.clientId !== state.clientId) return `${page}?google=client_changed`;

    let exchanged: Awaited<ReturnType<GoogleApi["exchangeCode"]>>;
    try {
      exchanged = await this.google.exchangeCode(client, query.code, state.verifier);
    } catch {
      return `${page}?google=failed`;
    }
    const { tokens, identity } = exchanged;
    const existing = await this.prisma.googleConnection.findUnique({
      where: {
        workspaceId_googleUserId: { workspaceId: state.workspaceId, googleUserId: identity.sub },
      },
    });
    // A stored refresh token is only worth keeping when the same client issued it.
    const sameClient =
      existing !== null &&
      (existing.oauthClientId ?? this.clients.instance?.clientId) === client.clientId;
    const refreshToken =
      tokens.refreshToken ?? (sameClient ? this.openTokens(existing).refreshToken : null);
    if (!refreshToken) return `${page}?google=failed`;

    const sealed = this.sealTokens(state.workspaceId, identity.sub, { ...tokens, refreshToken });
    const data = {
      email: identity.email,
      scopes: tokens.scopes,
      encryptedTokens: sealed.ciphertext,
      keyVersion: sealed.keyVersion,
      oauthClientId: client.clientId,
      status: "ACTIVE" as const,
      lastError: null,
    };
    const connection = await this.prisma.googleConnection.upsert({
      where: {
        workspaceId_googleUserId: { workspaceId: state.workspaceId, googleUserId: identity.sub },
      },
      create: {
        workspaceId: state.workspaceId,
        googleUserId: identity.sub,
        connectedBy: userId,
        ...data,
      },
      update: data,
    });
    await this.audit.record({
      workspaceId: state.workspaceId,
      action: "google.connected",
      target: { type: "google_connection", id: connection.id },
      metadata: { email: identity.email },
      meta,
    });
    return `${page}?google=connected`;
  }

  async disconnect(workspaceId: string, connectionId: string, meta: RequestMeta): Promise<void> {
    const connection = await this.find(workspaceId, connectionId);
    try {
      await this.google.revoke(this.openTokens(connection).refreshToken);
    } catch {
      // Tokens that cannot be opened are simply deleted.
    }
    // Sources that used the account go with it, and so does the data they imported.
    const sources = await this.prisma.projectIntegration.findMany({
      where: { connectionId: connection.id },
      select: { projectId: true, type: true },
    });
    await this.prisma.$transaction([
      ...sources.flatMap((source) =>
        deleteImportedFacts(this.prisma, source.projectId, source.type),
      ),
      this.prisma.googleConnection.delete({ where: { id: connection.id } }),
    ]);
    await this.audit.record({
      workspaceId,
      action: "google.disconnected",
      target: { type: "google_connection", id: connection.id },
      metadata: { email: connection.email },
      meta,
    });
  }

  /** Search Console sites and GA4 properties the account can read. */
  async properties(
    workspaceId: string,
    connectionId: string,
    projectId: string | undefined,
  ): Promise<GoogleProperties> {
    const connection = await this.find(workspaceId, connectionId);
    const project = projectId
      ? await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } })
      : null;
    const token = await this.accessToken(connection);
    try {
      const [sites, ga4] = await Promise.all([
        this.google.listSites(token),
        this.google.listGa4Properties(token).catch((error: unknown) => {
          // Accounts without Analytics access answer 403; show no properties.
          if (error instanceof GoogleApiError && error.status === 403) return [];
          throw error;
        }),
      ]);
      return {
        sites: sites
          .map((site) => ({
            ...site,
            matchesProject: project ? siteCovers(site.siteUrl, project) : false,
          }))
          .sort((a, b) => Number(b.matchesProject) - Number(a.matchesProject)),
        ga4: ga4.map((property) => ({
          property: property.property,
          displayName: property.displayName,
          accountName: property.accountName,
        })),
      };
    } catch (error) {
      throw googleProblem(error);
    }
  }

  /** A valid access token, refreshed when needed; marks revoked grants. */
  async accessToken(connection: ConnectionRow): Promise<string> {
    if (connection.status === "REVOKED") throw revokedProblem(connection);
    const stored = this.openTokens(connection);
    if (new Date(stored.expiresAt).getTime() - REFRESH_LEEWAY_MS > Date.now()) {
      return stored.accessToken;
    }
    const client = await this.clients.forConnection(connection);
    if (!client) {
      await this.markRevoked(connection, CLIENT_GONE);
      throw revokedProblem(connection);
    }
    let tokens: GoogleTokens;
    try {
      tokens = await this.google.refresh(client, stored.refreshToken);
    } catch (error) {
      if (error instanceof GoogleApiError && error.revoked) {
        await this.markRevoked(connection, error.message);
      }
      throw googleProblem(error);
    }
    const refreshToken = tokens.refreshToken ?? stored.refreshToken;
    const sealed = this.sealTokens(connection.workspaceId, connection.googleUserId, {
      ...tokens,
      refreshToken,
    });
    await this.prisma.googleConnection.update({
      where: { id: connection.id },
      data: { encryptedTokens: sealed.ciphertext, keyVersion: sealed.keyVersion, lastError: null },
    });
    return tokens.accessToken;
  }

  /** Stops using a connection until the account is connected again, and tells the admins. */
  private async markRevoked(connection: ConnectionRow, reason: string): Promise<void> {
    await this.prisma.googleConnection.update({
      where: { id: connection.id },
      data: { status: "REVOKED", lastError: reason.slice(0, 500) },
    });
    await this.notifications.notifyRoles(connection.workspaceId, ["owner", "admin"], {
      type: "google.revoked",
      title: "Google access was revoked",
      body: `Connect ${connection.email} again to keep Search Console and Analytics data current.`,
      data: { email: connection.email },
    });
  }

  async find(workspaceId: string, connectionId: string): Promise<ConnectionRow> {
    const connection = await this.prisma.googleConnection.findFirst({
      where: { id: connectionId, workspaceId },
    });
    if (!connection) throw ProblemException.notFound("Google connection not found.");
    return connection;
  }

  private openState(value: string | undefined): z.infer<typeof StateSchema> | null {
    if (!value) return null;
    const [version, ciphertext] = value.split(".");
    try {
      const state = StateSchema.parse(
        JSON.parse(
          this.secrets.open(
            Buffer.from(ciphertext ?? "", "base64url"),
            Number(version),
            STATE_CONTEXT,
          ),
        ),
      );
      return state.expiresAt > Date.now() ? state : null;
    } catch {
      return null;
    }
  }

  private sealTokens(
    workspaceId: string,
    googleUserId: string,
    tokens: GoogleTokens & { refreshToken: string },
  ) {
    return this.secrets.seal(
      JSON.stringify({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt.toISOString(),
      } satisfies z.infer<typeof StoredTokensSchema>),
      tokenContext(workspaceId, googleUserId),
    );
  }

  private openTokens(connection: ConnectionRow): z.infer<typeof StoredTokensSchema> {
    return StoredTokensSchema.parse(
      JSON.parse(
        this.secrets.open(
          connection.encryptedTokens,
          connection.keyVersion,
          tokenContext(connection.workspaceId, connection.googleUserId),
        ),
      ),
    );
  }
}

/** Whether a Search Console property covers the project's domain. */
export function siteCovers(
  siteUrl: string,
  project: { domain: string; includeSubdomains: boolean },
): boolean {
  if (siteUrl.startsWith("sc-domain:")) {
    return hostMatchesDomain(project.domain, siteUrl.slice("sc-domain:".length), {
      includeSubdomains: true,
    });
  }
  return hostMatchesDomain(siteUrl, project.domain, {
    includeSubdomains: project.includeSubdomains,
  });
}

function revokedProblem(connection: ConnectionRow): ProblemException {
  return new ProblemException({
    status: HttpStatus.CONFLICT,
    code: ErrorCode.ProviderError,
    detail: `Google access for ${connection.email} was revoked; connect the account again.`,
  });
}

export function googleProblem(error: unknown): unknown {
  if (!(error instanceof GoogleApiError)) return error;
  return new ProblemException({
    status:
      error.status >= 500 || error.code === "unreachable"
        ? HttpStatus.BAD_GATEWAY
        : HttpStatus.UNPROCESSABLE_ENTITY,
    code: ErrorCode.ProviderError,
    detail: `Google: ${error.message}`,
  });
}
