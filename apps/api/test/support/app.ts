import "reflect-metadata";

import type { Type } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { createTestDatabase, type TestDatabase } from "@seo-geo/db/testing";
import request from "supertest";

import { AppModule } from "../../src/app.module.js";
import { configureApp } from "../../src/app.setup.js";
import type { AppConfig } from "../../src/config/env.js";
import { MAILER, type MailMessage, type Mailer } from "../../src/mail/mailer.js";
import { testConfig } from "./config.js";

/** PostgreSQL server for integration tests; each test file gets its own database. */
export const TEST_SERVER_URL = process.env.TEST_DATABASE_URL;

export const WEB_ORIGIN = "http://localhost:3000";

export class CapturingMailer implements Mailer {
  readonly deliversEmail = true;
  readonly messages: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.messages.push(message);
  }

  /** The link in the latest message to `to`, as a path on the api. */
  lastLinkPath(to: string): string {
    const message = this.messages.findLast((candidate) => candidate.to === to);
    const link = message?.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error(`No link was emailed to ${to}`);
    const url = new URL(link);
    return url.pathname + url.search;
  }
}

export interface IntegrationApp {
  app: NestExpressApplication;
  config: AppConfig;
  mailer: CapturingMailer;
  database: TestDatabase;
  close(): Promise<void>;
}

export interface ProviderOverride {
  provide: unknown;
  useValue: unknown;
}

export async function createIntegrationApp(
  options: { env?: Record<string, string>; modules?: Type[]; overrides?: ProviderOverride[] } = {},
): Promise<IntegrationApp> {
  if (!TEST_SERVER_URL) throw new Error("TEST_DATABASE_URL is not set");
  const database = await createTestDatabase(TEST_SERVER_URL);
  const config = testConfig({ DATABASE_URL: database.url, WEB_URL: WEB_ORIGIN, ...options.env });
  const mailer = new CapturingMailer();

  let builder = Test.createTestingModule({
    imports: [AppModule.forRoot(config), ...(options.modules ?? [])],
  })
    .overrideProvider(MAILER)
    .useValue(mailer);
  for (const override of options.overrides ?? []) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
    bodyParser: false,
  });
  configureApp(app, config);
  await app.init();

  return {
    app,
    config,
    mailer,
    database,
    close: async () => {
      await app.close();
      await database.drop();
    },
  };
}

export type Agent = ReturnType<typeof request.agent>;

/** A cookie-keeping client that sends the web origin, as a browser behind the proxy would. */
export function browser(app: NestExpressApplication): Agent {
  return request.agent(app.getHttpServer()).set("Origin", WEB_ORIGIN);
}

/** Signs up, follows the verification link and returns a signed-in client. */
export async function signUpVerified(
  context: IntegrationApp,
  user: { name: string; email: string; password: string },
): Promise<Agent> {
  const agent = browser(context.app);
  await agent.post("/api/auth/sign-up/email").send(user).expect(200);
  await agent.get(context.mailer.lastLinkPath(user.email)).expect(302);
  return agent;
}
