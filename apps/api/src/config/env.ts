import { readFileSync } from "node:fs";

import {
  AppModeSchema,
  DeploymentModeSchema,
  type AppMode,
  type DeploymentMode,
} from "@seo-geo/contracts";
import { z } from "zod";

export const LOG_LEVELS = ["fatal", "error", "warn", "log", "debug", "verbose"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const Base64Key32 = z.string().refine((value) => Buffer.from(value, "base64").length === 32, {
  message: "Must be 32 random bytes, base64 encoded (openssl rand -base64 32)",
});

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_MODE: AppModeSchema.default("api"),
    DEPLOYMENT_MODE: DeploymentModeSchema.default("selfhost"),
    HOST: z.string().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("log"),
    /** Public origin of the web app; the browser reaches the api through it. */
    WEB_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3000"),
    /** Serve Swagger UI and the OpenAPI document. Defaults to on outside production. */
    API_DOCS: z.stringbool().optional(),
    /** Injected at image build time; falls back to package.json. */
    APP_VERSION: z.string().min(1).optional(),

    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Session-mode connection (Supabase: direct or session pooler) for migrations and the job queue. */
    DIRECT_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
    /** Signs session cookies and tokens. */
    AUTH_SECRET: z.string().min(32, "Use at least 32 characters (openssl rand -base64 32)"),
    /** Encrypts provider credentials at rest (AES-256-GCM). */
    ENCRYPTION_KEY: Base64Key32,
    /** Express `trust proxy`: which hops may set X-Forwarded-*; the web app is one. */
    TRUST_PROXY: z.string().min(1).default("loopback, linklocal, uniquelocal"),
    /** Apply pending database migrations before the api starts listening. */
    MIGRATE_ON_START: z.stringbool().default(false),
    /** Ports the crawler and other outbound fetches of user URLs may use, e.g. `80,443,8080`. */
    OUTBOUND_ALLOWED_PORTS: z
      .string()
      .default("80,443")
      .transform((value) => value.split(",").map((port) => Number(port.trim())))
      .pipe(z.array(z.int().min(1).max(65535)).min(1)),

    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    /** Implicit TLS (port 465). Otherwise STARTTLS is used when the server offers it. */
    SMTP_SECURE: z.stringbool().optional(),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.string().min(3).default("SEO-GEO <noreply@localhost>"),

    /** OAuth client for Search Console and Analytics (Google Cloud, "Web application"). */
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET)) {
      ctx.addIssue({
        code: "custom",
        path: [env.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID"],
        message: "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither",
      });
    }
    if (env.DEPLOYMENT_MODE === "cloud" && !env.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "The cloud edition needs email delivery",
      });
    }
  });

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  /** Registered in Google Cloud as an authorized redirect URI. */
  redirectUri: string;
}

export interface AppConfig {
  nodeEnv: "development" | "test" | "production";
  appMode: AppMode;
  deploymentMode: DeploymentMode;
  host: string;
  port: number;
  logLevel: LogLevel;
  webUrl: string;
  apiDocsEnabled: boolean;
  version: string;
  databaseUrl: string;
  /** Connection for pg-boss and migrations, which need session mode; DIRECT_URL when set. */
  queueDatabaseUrl: string;
  migrateOnStart: boolean;
  authSecret: string;
  encryptionKey: Buffer;
  trustProxy: string;
  /** Ports that fetches of user-supplied URLs may use. */
  outboundAllowedPorts: number[];
  /** `null` when no SMTP server is configured. */
  smtp: SmtpConfig | null;
  /** `null` when Google OAuth is not configured (Search Console and GA4 unavailable). */
  google: GoogleOAuthConfig | null;
}

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join("\n")}`,
    );
    this.name = "ConfigError";
  }
}

/** Parses and validates configuration. Empty variables are treated as unset. */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const withoutEmpty = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ""),
  );
  const parsed = EnvSchema.safeParse(withoutEmpty);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`),
    );
  }

  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    appMode: env.APP_MODE,
    deploymentMode: env.DEPLOYMENT_MODE,
    host: env.HOST,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    webUrl: new URL(env.WEB_URL).origin,
    apiDocsEnabled: env.API_DOCS ?? env.NODE_ENV !== "production",
    version: env.APP_VERSION ?? readPackageVersion(),
    databaseUrl: env.DATABASE_URL,
    queueDatabaseUrl: env.DIRECT_URL ?? env.DATABASE_URL,
    migrateOnStart: env.MIGRATE_ON_START,
    authSecret: env.AUTH_SECRET,
    encryptionKey: Buffer.from(env.ENCRYPTION_KEY, "base64"),
    trustProxy: env.TRUST_PROXY,
    outboundAllowedPorts: env.OUTBOUND_ALLOWED_PORTS,
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          from: env.SMTP_FROM,
        }
      : null,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            redirectUri: `${new URL(env.WEB_URL).origin}/api/v1/integrations/google/callback`,
          }
        : null,
  };
}

function readPackageVersion(): string {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    const version = (manifest as { version?: unknown }).version;
    return typeof version === "string" ? version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}
