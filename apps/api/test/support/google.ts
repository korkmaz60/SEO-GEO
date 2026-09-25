import { createHash } from "node:crypto";

import type { GoogleApiOptions } from "../../src/google/google-api.js";

export const GOOGLE_TEST_ENV = {
  GOOGLE_CLIENT_ID: "client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "client-secret",
};

const BASE = "https://google.test";

export const FAKE_GOOGLE_ENDPOINTS: Omit<GoogleApiOptions, "fetch"> = {
  authorizeUrl: `${BASE}/o/oauth2/v2/auth`,
  tokenUrl: `${BASE}/token`,
  revokeUrl: `${BASE}/revoke`,
  searchConsoleUrl: `${BASE}/webmasters/v3`,
  analyticsAdminUrl: `${BASE}/admin/v1beta`,
  analyticsDataUrl: `${BASE}/data/v1beta`,
};

export interface FakeGoogleState {
  /** OAuth clients Google knows: client ID → secret. */
  clients: Map<string, string>;
  /** PKCE challenges handed out, by authorization code. */
  challenges: Map<string, string>;
  /** The client each authorization code was issued to. */
  codeClients: Map<string, string>;
  /** The client each refresh token belongs to; only that client can use it. */
  refreshClients: Map<string, string>;
  /** Refresh tokens Google no longer accepts. */
  revoked: Set<string>;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  revokeCalls: string[];
}

const idToken = (claims: object) =>
  ["header", Buffer.from(JSON.stringify(claims)).toString("base64url"), "signature"].join(".");

/** Days from `start` to `end`, inclusive (YYYY-MM-DD). */
function days(start: string, end: string): string[] {
  const result: string[] = [];
  for (let date = new Date(`${start}T00:00:00Z`); date <= new Date(`${end}T00:00:00Z`);) {
    result.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return result;
}

/** A stand-in for Google's OAuth, Search Console and GA4 APIs. */
export function fakeGoogle() {
  const state: FakeGoogleState = {
    clients: new Map([[GOOGLE_TEST_ENV.GOOGLE_CLIENT_ID, GOOGLE_TEST_ENV.GOOGLE_CLIENT_SECRET]]),
    challenges: new Map(),
    codeClients: new Map(),
    refreshClients: new Map(),
    revoked: new Set(),
    expiresIn: 3600,
    revokeCalls: [],
  };
  let accessCounter = 0;
  const validAccess = new Set<string>();

  const issueAccess = () => {
    const token = `access-${++accessCounter}`;
    validAccess.add(token);
    return token;
  };

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const path = url.pathname;
    const form = () => new URLSearchParams(String(init?.body ?? ""));

    if (path === "/token") {
      const fields = form();
      const clientId = fields.get("client_id") ?? "";
      if (state.clients.get(clientId) !== fields.get("client_secret")) {
        return Response.json(
          { error: "invalid_client", error_description: "The OAuth client was not found." },
          { status: 401 },
        );
      }
      if (fields.get("grant_type") === "authorization_code") {
        const code = fields.get("code") ?? "";
        const challenge = state.challenges.get(code);
        const verifier = fields.get("code_verifier") ?? "";
        const expected = createHash("sha256").update(verifier).digest("base64url");
        if (!challenge || challenge !== expected || state.codeClients.get(code) !== clientId) {
          return Response.json(
            { error: "invalid_grant", error_description: "Bad code." },
            { status: 400 },
          );
        }
        // The installation's client keeps its well-known token; other clients get their own.
        const refreshToken =
          clientId === GOOGLE_TEST_ENV.GOOGLE_CLIENT_ID ? "refresh-1" : `refresh-${clientId}`;
        state.refreshClients.set(refreshToken, clientId);
        return Response.json({
          access_token: issueAccess(),
          expires_in: state.expiresIn,
          refresh_token: refreshToken,
          scope:
            "openid email https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
          id_token: idToken({ sub: "google-user-1", email: "owner@gmail.example" }),
        });
      }
      const refresh = fields.get("refresh_token") ?? "";
      const owner = state.refreshClients.get(refresh) ?? GOOGLE_TEST_ENV.GOOGLE_CLIENT_ID;
      if (owner !== clientId) {
        return Response.json(
          { error: "unauthorized_client", error_description: "Unauthorized" },
          { status: 400 },
        );
      }
      if (state.revoked.has(refresh)) {
        return Response.json(
          { error: "invalid_grant", error_description: "Token has been expired or revoked." },
          { status: 400 },
        );
      }
      return Response.json({ access_token: issueAccess(), expires_in: state.expiresIn });
    }
    if (path === "/revoke") {
      state.revokeCalls.push(form().get("token") ?? "");
      return new Response(null, { status: 200 });
    }

    const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!validAccess.has(token)) {
      return Response.json(
        { error: { status: "UNAUTHENTICATED", message: "Bad token" } },
        { status: 401 },
      );
    }

    if (path === "/webmasters/v3/sites") {
      return Response.json({
        siteEntry: [
          { siteUrl: "https://other.example.org/", permissionLevel: "siteFullUser" },
          { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
          { siteUrl: "https://unverified.example.net/", permissionLevel: "siteUnverifiedUser" },
        ],
      });
    }
    const analytics = /^\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/.exec(path);
    if (analytics) {
      const request = JSON.parse(String(init?.body)) as {
        startDate: string;
        endDate: string;
        dimensions: string[];
        rowLimit: number;
        startRow: number;
      };
      const rows = days(request.startDate, request.endDate).flatMap((date) => {
        if (request.dimensions.length === 1) {
          return [{ keys: [date], clicks: 30, impressions: 1000, ctr: 0.03, position: 8 }];
        }
        const second =
          request.dimensions[1] === "query"
            ? ["kahve makinesi", "espresso"]
            : ["https://example.com/", "https://example.com/blog"];
        return [
          { keys: [date, second[0]], clicks: 20, impressions: 400, ctr: 0.05, position: 4 },
          { keys: [date, second[1]], clicks: 5, impressions: 300, ctr: 0.0167, position: 12 },
        ];
      });
      return Response.json({
        rows: rows.slice(request.startRow, request.startRow + request.rowLimit),
      });
    }
    if (path === "/admin/v1beta/accountSummaries") {
      return Response.json({
        accountSummaries: [
          {
            account: "accounts/1",
            displayName: "Example",
            propertySummaries: [{ property: "properties/123", displayName: "example.com – GA4" }],
          },
        ],
      });
    }
    if (path === "/data/v1beta/properties/123:runReport") {
      const request = JSON.parse(String(init?.body)) as {
        dateRanges: { startDate: string; endDate: string }[];
        limit: number;
        offset: number;
      };
      const range = request.dateRanges[0] as { startDate: string; endDate: string };
      const rows = days(range.startDate, range.endDate).flatMap((date) => {
        const compact = date.replaceAll("-", "");
        const row = (page: string, channel: string, source: string, sessions: number) => ({
          dimensionValues: [
            { value: compact },
            { value: page },
            { value: channel },
            { value: source },
          ],
          metricValues: [
            { value: String(sessions) },
            { value: String(sessions - 1) },
            { value: String(Math.floor(sessions / 2)) },
            { value: "1" },
          ],
        });
        return [
          row("/", "Organic Search", "google", 40),
          row("/blog", "Referral", "chatgpt.com", 6),
          row("/", "Direct", "(direct)", 10),
        ];
      });
      return Response.json({
        rows: rows.slice(request.offset, request.offset + request.limit),
        rowCount: rows.length,
      });
    }
    return Response.json({ error: { status: "NOT_FOUND", message: path } }, { status: 404 });
  };

  return {
    options: {
      ...FAKE_GOOGLE_ENDPOINTS,
      fetch: fetch as typeof globalThis.fetch,
    } satisfies GoogleApiOptions,
    state,
    /** Plays Google's consent screen: remembers the challenge and returns a code. */
    consent(authorizationUrl: string): { code: string; state: string } {
      const url = new URL(authorizationUrl);
      const code = `code-${state.challenges.size + 1}`;
      state.challenges.set(code, url.searchParams.get("code_challenge") ?? "");
      state.codeClients.set(code, url.searchParams.get("client_id") ?? "");
      return { code, state: url.searchParams.get("state") ?? "" };
    },
  };
}
