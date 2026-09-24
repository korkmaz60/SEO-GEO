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

export const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: AppModeSchema.default("api"),
  DEPLOYMENT_MODE: DeploymentModeSchema.default("selfhost"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("log"),
  WEB_URL: z.url().default("http://localhost:3000"),
  /** Serve Swagger UI and the OpenAPI document. Defaults to on outside production. */
  API_DOCS: z.stringbool().optional(),
  /** Injected at image build time; falls back to package.json. */
  APP_VERSION: z.string().min(1).optional(),
});

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
    webUrl: env.WEB_URL,
    apiDocsEnabled: env.API_DOCS ?? env.NODE_ENV !== "production",
    version: env.APP_VERSION ?? readPackageVersion(),
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
