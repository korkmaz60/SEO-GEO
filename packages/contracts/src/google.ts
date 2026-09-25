import { z } from "zod";

import { IsoDateSchema } from "./rank-tracker.js";

export const GoogleConnectionStatusSchema = z.enum(["ACTIVE", "REVOKED"]);

/** A connected Google account; tokens are never returned. */
export const GoogleConnectionSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  status: GoogleConnectionStatusSchema,
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type GoogleConnection = z.infer<typeof GoogleConnectionSchema>;

/**
 * Google OAuth client IDs end in `.apps.googleusercontent.com`; a lenient check that catches a
 * secret or a URL pasted into the wrong field. Google itself checks the client before it is
 * saved.
 */
export const GOOGLE_CLIENT_ID_PATTERN = /^[0-9a-z][0-9a-z._-]*\.apps\.googleusercontent\.com$/i;

/** Where the client new connections use comes from. */
export const GoogleOAuthClientSourceSchema = z.enum(["WORKSPACE", "INSTANCE"]);
export type GoogleOAuthClientSource = z.infer<typeof GoogleOAuthClientSourceSchema>;

/** A Google OAuth client; the secret is never returned. */
export const GoogleOAuthClientSchema = z.object({
  source: GoogleOAuthClientSourceSchema,
  /** Not secret: Google shows it in every consent URL. */
  clientId: z.string(),
  /** When the workspace's client was saved and checked with Google; `null` for the installation's. */
  verifiedAt: z.iso.datetime().nullable(),
});
export type GoogleOAuthClient = z.infer<typeof GoogleOAuthClientSchema>;

export const GoogleIntegrationsSchema = z.object({
  /** Whether Google accounts can be connected: the workspace or the installation has a client. */
  configured: z.boolean(),
  /** The client new connections use: the workspace's own, else the installation's. */
  client: GoogleOAuthClientSchema.nullable(),
  /** Whether the installation has a client to fall back on (GOOGLE_CLIENT_ID/SECRET). */
  instanceClient: z.boolean(),
  /** The redirect URI to register on the client in Google Cloud (derived from WEB_URL). */
  redirectUri: z.string(),
  connections: z.array(GoogleConnectionSchema),
});
export type GoogleIntegrations = z.infer<typeof GoogleIntegrationsSchema>;

/** A workspace's own Google OAuth client (web application type). */
export const SaveGoogleOAuthClientSchema = z.strictObject({
  clientId: z.string().trim().max(200).regex(GOOGLE_CLIENT_ID_PATTERN),
  clientSecret: z.string().trim().min(10).max(200).regex(/^\S+$/u),
});
export type SaveGoogleOAuthClient = z.infer<typeof SaveGoogleOAuthClientSchema>;

export const GoogleAuthorizeSchema = z.strictObject({
  /** The project whose Search Console page started the flow; the user returns there. */
  projectId: z.uuid(),
});

export const GooglePropertiesSchema = z.object({
  sites: z.array(
    z.object({
      siteUrl: z.string(),
      permissionLevel: z.string(),
      /** The property covers the project's domain. */
      matchesProject: z.boolean(),
    }),
  ),
  ga4: z.array(
    z.object({ property: z.string(), displayName: z.string(), accountName: z.string() }),
  ),
});
export type GoogleProperties = z.infer<typeof GooglePropertiesSchema>;

export const IntegrationTypeSchema = z.enum(["GSC", "GA4"]);
export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const ProjectIntegrationSchema = z.object({
  type: IntegrationTypeSchema,
  connectionId: z.uuid(),
  email: z.string(),
  connectionStatus: GoogleConnectionStatusSchema,
  /** Search Console site or GA4 property (`properties/123`). */
  externalId: z.string(),
  displayName: z.string().nullable(),
  lastSyncedAt: z.iso.datetime().nullable(),
  /** Last day with imported data. */
  syncedThrough: IsoDateSchema.nullable(),
  lastError: z.string().nullable(),
});
export type ProjectIntegration = z.infer<typeof ProjectIntegrationSchema>;

export const ProjectIntegrationsSchema = z.object({
  gsc: ProjectIntegrationSchema.nullable(),
  ga4: ProjectIntegrationSchema.nullable(),
});
export type ProjectIntegrations = z.infer<typeof ProjectIntegrationsSchema>;

export const SelectGscSiteSchema = z.strictObject({
  connectionId: z.uuid(),
  siteUrl: z.string().min(1).max(500),
});
export type SelectGscSite = z.infer<typeof SelectGscSiteSchema>;

export const SelectGa4PropertySchema = z.strictObject({
  connectionId: z.uuid(),
  property: z.string().regex(/^properties\/\d+$/),
});
export type SelectGa4Property = z.infer<typeof SelectGa4PropertySchema>;

// ── Performance data ──────────────────────────────────────────────────────────────

export const PERFORMANCE_RANGES = [7, 28, 90] as const;

export const PerformanceQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((value) => (PERFORMANCE_RANGES as readonly number[]).includes(value), "Use 7, 28 or 90")
    .default(28),
});

const RangeSchema = z.object({ start: IsoDateSchema, end: IsoDateSchema });

export const SearchTotalsSchema = z.object({
  clicks: z.int(),
  impressions: z.int(),
  /** Clicks per impression, 0–1. */
  ctr: z.number(),
  /** Average position weighted by impressions; `null` without impressions. */
  position: z.number().nullable(),
});
export type SearchTotals = z.infer<typeof SearchTotalsSchema>;

const SearchRowSchema = SearchTotalsSchema.extend({
  /** The same metrics in the previous period, when the row existed then. */
  previousClicks: z.int().nullable(),
  previousPosition: z.number().nullable(),
});

export const SearchConsoleDataSchema = z.object({
  range: RangeSchema,
  totals: SearchTotalsSchema,
  previous: SearchTotalsSchema,
  daily: z.array(SearchTotalsSchema.extend({ date: IsoDateSchema })),
  queries: z.array(SearchRowSchema.extend({ query: z.string() })),
  pages: z.array(SearchRowSchema.extend({ page: z.string() })),
});
export type SearchConsoleData = z.infer<typeof SearchConsoleDataSchema>;

/** Additive GA4 metrics only; users cannot be summed across pages and days. */
export const AnalyticsTotalsSchema = z.object({
  sessions: z.int(),
  engagedSessions: z.int(),
  keyEvents: z.number(),
  /** Sessions from the Organic Search channel. */
  organicSessions: z.int(),
  /** Sessions referred by AI assistants (ChatGPT, Perplexity, Gemini, …). */
  aiSessions: z.int(),
});
export type AnalyticsTotals = z.infer<typeof AnalyticsTotalsSchema>;

export const AnalyticsDataSchema = z.object({
  range: RangeSchema,
  totals: AnalyticsTotalsSchema,
  previous: AnalyticsTotalsSchema,
  daily: z.array(
    z.object({
      date: IsoDateSchema,
      sessions: z.int(),
      organicSessions: z.int(),
      aiSessions: z.int(),
    }),
  ),
  landingPages: z.array(
    z.object({
      page: z.string(),
      sessions: z.int(),
      organicSessions: z.int(),
      engagedSessions: z.int(),
    }),
  ),
  aiReferrals: z.array(
    z.object({ name: z.string(), sessions: z.int(), previousSessions: z.int() }),
  ),
});
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;

export const PerformanceDataSchema = z.object({
  googleConfigured: z.boolean(),
  integrations: ProjectIntegrationsSchema,
  searchConsole: SearchConsoleDataSchema.nullable(),
  analytics: AnalyticsDataSchema.nullable(),
});
export type PerformanceData = z.infer<typeof PerformanceDataSchema>;
