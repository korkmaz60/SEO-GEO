import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "../src/config/env.js";

describe("loadConfig", () => {
  it("applies defaults", () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      nodeEnv: "development",
      appMode: "api",
      deploymentMode: "selfhost",
      host: "0.0.0.0",
      port: 4000,
      logLevel: "log",
      webUrl: "http://localhost:3000",
      apiDocsEnabled: true,
    });
    expect(config.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("treats empty variables as unset", () => {
    expect(loadConfig({ PORT: "", LOG_LEVEL: "  " })).toMatchObject({
      port: 4000,
      logLevel: "log",
    });
  });

  it("parses explicit values", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      APP_MODE: "worker",
      DEPLOYMENT_MODE: "cloud",
      PORT: "8080",
      LOG_LEVEL: "debug",
      WEB_URL: "https://app.example.com",
      APP_VERSION: "1.2.3",
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
    });
  });

  it("lets API_DOCS override the production default", () => {
    expect(loadConfig({ NODE_ENV: "production", API_DOCS: "true" }).apiDocsEnabled).toBe(true);
    expect(loadConfig({ API_DOCS: "false" }).apiDocsEnabled).toBe(false);
  });

  it("reports every invalid variable", () => {
    let error: unknown;
    try {
      loadConfig({ PORT: "70000", DEPLOYMENT_MODE: "saas", WEB_URL: "not a url" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ConfigError);
    const issues = (error as ConfigError).issues.join("\n");
    expect(issues).toContain("PORT");
    expect(issues).toContain("DEPLOYMENT_MODE");
    expect(issues).toContain("WEB_URL");
  });
});
