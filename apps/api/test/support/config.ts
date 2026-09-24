import { loadConfig, type AppConfig } from "../../src/config/env.js";

/** Valid values for the required secrets; never used outside tests. */
export const TEST_ENV = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://seogeo:seogeo@127.0.0.1:5432/seogeo",
  AUTH_SECRET: "test-only-auth-secret-with-at-least-32-characters",
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
} as const;

export function testConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...overrides });
}
