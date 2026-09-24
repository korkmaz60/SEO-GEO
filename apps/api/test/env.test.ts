import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config/env.js";
import { TEST_ENV } from "./support/config.js";

const required = {
  DATABASE_URL: TEST_ENV.DATABASE_URL,
  AUTH_SECRET: TEST_ENV.AUTH_SECRET,
  ENCRYPTION_KEY: TEST_ENV.ENCRYPTION_KEY,
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig(required);
    expect(config).toMatchObject({
      nodeEnv: "development",
      appMode: "api",
      deploymentMode: "selfhost",
      host: "0.0.0.0",
      port: 4000,
      logLevel: "log",
      webUrl: "http://localhost:3000",
      apiDocsEnabled: true,
      trustProxy: "loopback, linklocal, uniquelocal",
      smtp: null,
    });
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(config.encryptionKey).toHaveLength(32);
  });

  it("treats empty variables as unset", () => {
    expect(loadConfig({ ...required, PORT: "", LOG_LEVEL: "  " })).toMatchObject({
      port: 4000,
      logLevel: "log",
    });
  });

  it("parses explicit values", () => {
    const config = loadConfig({
      ...required,
      NODE_ENV: "production",
      APP_MODE: "worker",
      DEPLOYMENT_MODE: "cloud",
      PORT: "8080",
      LOG_LEVEL: "debug",
      WEB_URL: "https://app.example.com/",
      APP_VERSION: "1.2.3",
      SMTP_HOST: "smtp.example.com",
      SMTP_PORT: "465",
      SMTP_USER: "mailer",
      SMTP_PASSWORD: "secret",
    });
    expect(config).toMatchObject({
      nodeEnv: "production",
      appMode: "worker",
      deploymentMode: "cloud",
      port: 8080,
      logLevel: "debug",
      webUrl: "https://app.example.com",
      version: "1.2.3",
      apiDocsEnabled: false,
      smtp: { host: "smtp.example.com", port: 465, secure: true, user: "mailer" },
    });
  });

  it("lets API_DOCS override the production default", () => {
    expect(
      loadConfig({ ...required, NODE_ENV: "production", API_DOCS: "true" }).apiDocsEnabled,
    ).toBe(true);
    expect(loadConfig({ ...required, API_DOCS: "false" }).apiDocsEnabled).toBe(false);
  });

  it("requires the database and secrets", () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL[\s\S]*AUTH_SECRET[\s\S]*ENCRYPTION_KEY/);
  });

  it("requires email delivery for the cloud edition", () => {
    expect(() => loadConfig({ ...required, DEPLOYMENT_MODE: "cloud" })).toThrow(/SMTP_HOST/);
  });

  it("reports every invalid variable", () => {
    let error: unknown;
    try {
      loadConfig({
        ...required,
        PORT: "70000",
        DEPLOYMENT_MODE: "saas",
        WEB_URL: "not a url",
        DATABASE_URL: "mysql://localhost/db",
        AUTH_SECRET: "short",
        ENCRYPTION_KEY: "dG9vIHNob3J0",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const issues = (error as ConfigError).issues.join("\n");
    for (const name of [
      "PORT",
      "DEPLOYMENT_MODE",
      "WEB_URL",
      "DATABASE_URL",
      "AUTH_SECRET",
      "ENCRYPTION_KEY",
    ]) {
      expect(issues).toContain(name);
    }
  });
});
