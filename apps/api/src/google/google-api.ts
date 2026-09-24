import { Inject, Injectable } from "@nestjs/common";
import { z } from "zod";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig, GoogleOAuthConfig } from "../config/env.js";

/** Endpoints and transport for Google APIs; replaced in tests. */
export interface GoogleApiOptions {
  fetch?: typeof globalThis.fetch;
  authorizeUrl?: string;
  tokenUrl?: string;
  revokeUrl?: string;
  searchConsoleUrl?: string;
  analyticsAdminUrl?: string;
  analyticsDataUrl?: string;
}

export const GOOGLE_API_OPTIONS = Symbol("GOOGLE_API_OPTIONS");

const ENDPOINTS = {
  authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  revokeUrl: "https://oauth2.googleapis.com/revoke",
  searchConsoleUrl: "https://www.googleapis.com/webmasters/v3",
  analyticsAdminUrl: "https://analyticsadmin.googleapis.com/v1beta",
  analyticsDataUrl: "https://analyticsdata.googleapis.com/v1beta",
};

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

const TIMEOUT_MS = 30_000;

/** A failed Google request; `code` is the OAuth error or the API status, e.g. `invalid_grant`. */
export class GoogleApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }

  /** The refresh token no longer works: access was revoked or expired. */
  get revoked(): boolean {
    return this.code === "invalid_grant";
  }
}

export interface GoogleTokens {
  accessToken: string;
  /** Only returned on the first consent (or with `prompt=consent`). */
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string[];
}

export interface GoogleIdentity {
  /** Stable account ID. */
  sub: string;
  email: string;
}

const TokenResponseSchema = z.looseObject({
  access_token: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

const IdTokenClaimsSchema = z.looseObject({ sub: z.string(), email: z.string() });

const SitesSchema = z.looseObject({
  siteEntry: z
    .array(z.looseObject({ siteUrl: z.string(), permissionLevel: z.string() }))
    .optional(),
});

const SearchAnalyticsSchema = z.looseObject({
  rows: z
    .array(
      z.looseObject({
        keys: z.array(z.string()).optional(),
        clicks: z.number(),
        impressions: z.number(),
        ctr: z.number(),
        position: z.number(),
      }),
    )
    .optional(),
});

const AccountSummariesSchema = z.looseObject({
  accountSummaries: z
    .array(
      z.looseObject({
        account: z.string(),
        displayName: z.string().optional(),
        propertySummaries: z
          .array(
            z.looseObject({
              property: z.string(),
              displayName: z.string().optional(),
              propertyType: z.string().optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  nextPageToken: z.string().optional(),
});

const RunReportSchema = z.looseObject({
  rows: z
    .array(
      z.looseObject({
        dimensionValues: z.array(z.looseObject({ value: z.string().optional() })),
        metricValues: z.array(z.looseObject({ value: z.string().optional() })),
      }),
    )
    .optional(),
  rowCount: z.number().optional(),
});

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position: number;
}

export interface Ga4Property {
  property: string;
  displayName: string;
  account: string;
  accountName: string;
}

export interface ReportRow {
  dimensions: string[];
  metrics: number[];
}

function decodeJwtPayload(token: string): unknown {
  const payload = token.split(".")[1];
  if (!payload) throw new GoogleApiError(502, "invalid_id_token", "Google returned no identity");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

/** OAuth 2.0 (authorization code with PKCE), Search Console and GA4 over plain HTTPS. */
@Injectable()
export class GoogleApi {
  private readonly endpoints: typeof ENDPOINTS;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(GOOGLE_API_OPTIONS) options: GoogleApiOptions,
  ) {
    this.endpoints = { ...ENDPOINTS, ...stripUndefined(options) };
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  get configured(): boolean {
    return this.config.google !== null;
  }

  private get oauth(): GoogleOAuthConfig {
    if (!this.config.google) {
      throw new GoogleApiError(503, "not_configured", "Google OAuth is not configured");
    }
    return this.config.google;
  }

  authorizationUrl(input: { state: string; codeChallenge: string; loginHint?: string }): string {
    const url = new URL(this.endpoints.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: this.oauth.clientId,
      redirect_uri: this.oauth.redirectUri,
      response_type: "code",
      scope: GOOGLE_SCOPES.join(" "),
      access_type: "offline",
      // Always ask, so Google returns a refresh token even for a returning account.
      prompt: "consent",
      include_granted_scopes: "true",
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256",
      ...(input.loginHint ? { login_hint: input.loginHint } : {}),
    }).toString();
    return url.toString();
  }

  async exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{ tokens: GoogleTokens; identity: GoogleIdentity }> {
    const response = TokenResponseSchema.parse(
      await this.form(this.endpoints.tokenUrl, {
        code,
        code_verifier: codeVerifier,
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        redirect_uri: this.oauth.redirectUri,
        grant_type: "authorization_code",
      }),
    );
    if (!response.id_token) {
      throw new GoogleApiError(502, "invalid_id_token", "Google returned no identity");
    }
    // The ID token comes straight from Google's token endpoint over TLS, so its claims can
    // be read without verifying the signature (OpenID Connect Core, section 3.1.3.7).
    const identity = IdTokenClaimsSchema.parse(decodeJwtPayload(response.id_token));
    return {
      tokens: this.toTokens(response),
      identity: { sub: identity.sub, email: identity.email },
    };
  }

  async refresh(refreshToken: string): Promise<GoogleTokens> {
    const response = TokenResponseSchema.parse(
      await this.form(this.endpoints.tokenUrl, {
        refresh_token: refreshToken,
        client_id: this.oauth.clientId,
        client_secret: this.oauth.clientSecret,
        grant_type: "refresh_token",
      }),
    );
    return { ...this.toTokens(response), refreshToken: response.refresh_token ?? refreshToken };
  }

  /** Revokes the grant at Google; failures are ignored (the token may be gone already). */
  async revoke(token: string): Promise<void> {
    try {
      await this.form(this.endpoints.revokeUrl, { token });
    } catch {
      // Nothing to do: the connection is removed either way.
    }
  }

  async listSites(accessToken: string): Promise<{ siteUrl: string; permissionLevel: string }[]> {
    const body = SitesSchema.parse(
      await this.json(`${this.endpoints.searchConsoleUrl}/sites`, accessToken),
    );
    return (body.siteEntry ?? [])
      .filter((entry) => entry.permissionLevel !== "siteUnverifiedUser")
      .map((entry) => ({ siteUrl: entry.siteUrl, permissionLevel: entry.permissionLevel }));
  }

  async searchAnalytics(
    accessToken: string,
    siteUrl: string,
    request: {
      startDate: string;
      endDate: string;
      dimensions: string[];
      rowLimit: number;
      startRow: number;
    },
  ): Promise<SearchAnalyticsRow[]> {
    const url = `${this.endpoints.searchConsoleUrl}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
    const body = SearchAnalyticsSchema.parse(
      await this.json(url, accessToken, { ...request, type: "web", dataState: "all" }),
    );
    return (body.rows ?? []).map((row) => ({
      keys: row.keys ?? [],
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    }));
  }

  async listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
    const properties: Ga4Property[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const url = new URL(`${this.endpoints.analyticsAdminUrl}/accountSummaries`);
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const body = AccountSummariesSchema.parse(await this.json(url.toString(), accessToken));
      for (const account of body.accountSummaries ?? []) {
        for (const property of account.propertySummaries ?? []) {
          properties.push({
            property: property.property,
            displayName: property.displayName ?? property.property,
            account: account.account,
            accountName: account.displayName ?? account.account,
          });
        }
      }
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return properties;
  }

  async runReport(
    accessToken: string,
    property: string,
    request: {
      startDate: string;
      endDate: string;
      dimensions: string[];
      metrics: string[];
      limit: number;
      offset: number;
    },
  ): Promise<{ rows: ReportRow[]; rowCount: number }> {
    const body = RunReportSchema.parse(
      await this.json(`${this.endpoints.analyticsDataUrl}/${property}:runReport`, accessToken, {
        dateRanges: [{ startDate: request.startDate, endDate: request.endDate }],
        dimensions: request.dimensions.map((name) => ({ name })),
        metrics: request.metrics.map((name) => ({ name })),
        limit: request.limit,
        offset: request.offset,
      }),
    );
    return {
      rowCount: body.rowCount ?? 0,
      rows: (body.rows ?? []).map((row) => ({
        dimensions: row.dimensionValues.map((value) => value.value ?? ""),
        metrics: row.metricValues.map((value) => Number(value.value ?? 0) || 0),
      })),
    };
  }

  private toTokens(response: z.infer<typeof TokenResponseSchema>): GoogleTokens {
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? null,
      expiresAt: new Date(Date.now() + response.expires_in * 1000),
      scopes: response.scope ? response.scope.split(" ") : [],
    };
  }

  private async form(url: string, fields: Record<string, string>): Promise<unknown> {
    return this.request(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  }

  private async json(url: string, accessToken: string, body?: object): Promise<unknown> {
    return this.request(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      throw new GoogleApiError(502, "unreachable", `Google could not be reached: ${String(error)}`);
    }
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      const error = body as {
        error?: string | { status?: string; message?: string };
        error_description?: string;
      } | null;
      const code =
        typeof error?.error === "string"
          ? error.error
          : (error?.error?.status ?? `http_${response.status}`);
      const message =
        error?.error_description ??
        (typeof error?.error === "object" ? error.error.message : undefined) ??
        `Google answered with HTTP ${response.status}`;
      throw new GoogleApiError(response.status, code, message);
    }
    return body;
  }
}

function stripUndefined(options: GoogleApiOptions): Partial<typeof ENDPOINTS> {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => key !== "fetch" && value !== undefined),
  ) as Partial<typeof ENDPOINTS>;
}
