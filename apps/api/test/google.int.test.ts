import {
  GoogleIntegrationsSchema,
  GooglePropertiesSchema,
  PerformanceDataSchema,
  ProjectDetailSchema,
  ProjectIntegrationsSchema,
  type ProjectDetail,
} from "@seo-geo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../src/database/prisma.service.js";
import { GOOGLE_API_OPTIONS } from "../src/google/google-api.js";
import { GoogleOAuthClientsService } from "../src/google/google-oauth-clients.service.js";
import { GoogleSyncService } from "../src/google/google-sync.service.js";
import {
  TEST_SERVER_URL,
  WEB_ORIGIN,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";
import { GOOGLE_TEST_ENV, fakeGoogle } from "./support/google.js";

const PASSWORD = "a long enough password";
const TODAY = "2026-09-24";

describe.skipIf(!TEST_SERVER_URL)("Google Search Console and GA4", () => {
  const google = fakeGoogle();
  let context: IntegrationApp;
  let owner: Agent;
  let member: Agent;
  let workspace: string;
  let project: ProjectDetail;
  let connectionId: string;

  const ws = (path: string) => `/api/v1/workspaces/${workspace}${path}`;
  const projectApi = (path: string) => ws(`/projects/${project.id}${path}`);

  async function connect(agent: Agent): Promise<string> {
    const { body } = await agent
      .post(ws("/integrations/google/authorize"))
      .send({ projectId: project.id })
      .expect(200);
    const consent = google.consent(body.url as string);
    const response = await agent
      .get(
        `/api/v1/integrations/google/callback?code=${consent.code}&state=${encodeURIComponent(consent.state)}`,
      )
      .expect(302);
    return response.headers.location as string;
  }

  beforeAll(async () => {
    context = await createIntegrationApp({
      env: { DEPLOYMENT_MODE: "cloud", SMTP_HOST: "smtp.invalid", ...GOOGLE_TEST_ENV },
      overrides: [{ provide: GOOGLE_API_OPTIONS, useValue: google.options }],
    });
    owner = await signUpVerified(context, {
      name: "Owner",
      email: "owner@example.com",
      password: PASSWORD,
    });
    workspace = (
      await owner
        .post("/api/auth/organization/create")
        .send({ name: "Agency", slug: "agency" })
        .expect(200)
    ).body.id as string;
    member = await signUpVerified(context, {
      name: "Member",
      email: "member@example.com",
      password: PASSWORD,
    });
    await owner
      .post("/api/auth/organization/invite-member")
      .send({ email: "member@example.com", role: "member", organizationId: workspace })
      .expect(200);
    const invitationId = context.mailer.lastLinkPath("member@example.com").split("/").pop();
    await member
      .post("/api/auth/organization/accept-invitation")
      .send({ invitationId })
      .expect(200);
    project = ProjectDetailSchema.parse(
      (
        await owner
          .post(ws("/projects"))
          .send({
            name: "Example",
            domain: "www.example.com",
            locationCode: 2792,
            languageCode: "tr",
          })
          .expect(201)
      ).body,
    );
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it("connects a Google account with PKCE, bound to the signed-in admin", async () => {
    const status = GoogleIntegrationsSchema.parse(
      (await member.get(ws("/integrations/google")).expect(200)).body,
    );
    expect(status).toEqual({
      configured: true,
      client: { source: "INSTANCE", clientId: GOOGLE_TEST_ENV.GOOGLE_CLIENT_ID, verifiedAt: null },
      instanceClient: true,
      redirectUri: `${WEB_ORIGIN}/api/v1/integrations/google/callback`,
      connections: [],
    });
    await member
      .post(ws("/integrations/google/authorize"))
      .send({ projectId: project.id })
      .expect(403);

    const { body } = await owner
      .post(ws("/integrations/google/authorize"))
      .send({ projectId: project.id })
      .expect(200);
    const url = new URL(body.url as string);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: GOOGLE_TEST_ENV.GOOGLE_CLIENT_ID,
      redirect_uri: `${WEB_ORIGIN}/api/v1/integrations/google/callback`,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("scope")).toContain("webmasters.readonly");

    // Someone else cannot complete the owner's flow, and a changed state is refused.
    const consent = google.consent(url.toString());
    const stolen = await member
      .get(
        `/api/v1/integrations/google/callback?code=${consent.code}&state=${encodeURIComponent(consent.state)}`,
      )
      .expect(302);
    expect(stolen.headers.location).toBe(`${WEB_ORIGIN}/?google=invalid_state`);
    const tampered = await owner
      .get(`/api/v1/integrations/google/callback?code=${consent.code}&state=1.${"A".repeat(80)}`)
      .expect(302);
    expect(tampered.headers.location).toBe(`${WEB_ORIGIN}/?google=invalid_state`);
    const denied = await owner
      .get(
        `/api/v1/integrations/google/callback?error=access_denied&state=${encodeURIComponent(consent.state)}`,
      )
      .expect(302);
    expect(denied.headers.location).toBe(
      `${WEB_ORIGIN}/agency/example-com/search-console?google=denied`,
    );

    expect(await connect(owner)).toBe(
      `${WEB_ORIGIN}/agency/example-com/search-console?google=connected`,
    );
    const connected = GoogleIntegrationsSchema.parse(
      (await member.get(ws("/integrations/google")).expect(200)).body,
    );
    expect(connected.connections).toEqual([
      expect.objectContaining({ email: "owner@gmail.example", status: "ACTIVE" }),
    ]);
    connectionId = connected.connections[0]?.id as string;

    // Tokens are stored encrypted, with the client that issued them.
    const row = await context.app.get(PrismaService).googleConnection.findFirstOrThrow();
    expect(Buffer.from(row.encryptedTokens).toString("utf8")).not.toContain("refresh-1");
    expect(row.oauthClientId).toBe(GOOGLE_TEST_ENV.GOOGLE_CLIENT_ID);
  });

  it("lists properties and selects a Search Console site the account can read", async () => {
    const properties = GooglePropertiesSchema.parse(
      (
        await member
          .get(ws(`/integrations/google/${connectionId}/properties?projectId=${project.id}`))
          .expect(200)
      ).body,
    );
    expect(properties.sites).toEqual([
      { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner", matchesProject: true },
      {
        siteUrl: "https://other.example.org/",
        permissionLevel: "siteFullUser",
        matchesProject: false,
      },
    ]);
    expect(properties.ga4).toEqual([
      { property: "properties/123", displayName: "example.com – GA4", accountName: "Example" },
    ]);

    await member
      .put(projectApi("/integrations/gsc"))
      .send({ connectionId, siteUrl: "https://unverified.example.net/" })
      .expect(422);
    const selected = ProjectIntegrationsSchema.parse(
      (
        await member
          .put(projectApi("/integrations/gsc"))
          .send({ connectionId, siteUrl: "sc-domain:example.com" })
          .expect(200)
      ).body,
    );
    expect(selected.gsc).toMatchObject({
      externalId: "sc-domain:example.com",
      email: "owner@gmail.example",
      syncedThrough: null,
    });
  });

  it("imports 90 days of Search Console data and reports the period", async () => {
    const prisma = context.app.get(PrismaService);
    const integration = await prisma.projectIntegration.findFirstOrThrow({
      where: { type: "GSC" },
    });
    await context.app.get(GoogleSyncService).sync(integration.id, TODAY);

    expect(await prisma.gscSiteDaily.count()).toBe(90);
    expect(await prisma.gscQueryDaily.count()).toBe(180);

    const data = PerformanceDataSchema.parse(
      (await member.get(projectApi("/performance?days=28")).expect(200)).body,
    );
    expect(data.integrations.gsc?.syncedThrough).toBe("2026-09-23");
    const gsc = data.searchConsole;
    expect(gsc?.range).toEqual({ start: "2026-08-27", end: "2026-09-23" });
    expect(gsc?.totals).toEqual({
      clicks: 28 * 30,
      impressions: 28 * 1000,
      ctr: 0.03,
      position: 8,
    });
    expect(gsc?.previous.clicks).toBe(28 * 30);
    expect(gsc?.daily).toHaveLength(28);
    expect(gsc?.queries[0]).toMatchObject({
      query: "kahve makinesi",
      clicks: 28 * 20,
      position: 4,
      previousClicks: 28 * 20,
    });
    expect(gsc?.pages.map((page) => page.page)).toEqual([
      "https://example.com/",
      "https://example.com/blog",
    ]);
    expect(data.analytics).toBeNull();

    // A second sync re-imports only the last days, without duplicates.
    await context.app.get(GoogleSyncService).sync(integration.id, "2026-09-25");
    expect(await prisma.gscSiteDaily.count()).toBe(91);
  });

  it("imports GA4 sessions with organic and AI assistant traffic", async () => {
    await member
      .put(projectApi("/integrations/ga4"))
      .send({ connectionId, property: "properties/999" })
      .expect(422);
    await member
      .put(projectApi("/integrations/ga4"))
      .send({ connectionId, property: "properties/123" })
      .expect(200);
    const prisma = context.app.get(PrismaService);
    const integration = await prisma.projectIntegration.findFirstOrThrow({
      where: { type: "GA4" },
    });
    await context.app.get(GoogleSyncService).sync(integration.id, TODAY);

    const data = PerformanceDataSchema.parse(
      (await member.get(projectApi("/performance?days=7")).expect(200)).body,
    );
    expect(data.analytics?.totals).toEqual({
      sessions: 7 * 56,
      engagedSessions: 7 * (20 + 3 + 5),
      keyEvents: 7 * 3,
      organicSessions: 7 * 40,
      aiSessions: 7 * 6,
    });
    expect(data.analytics?.aiReferrals).toEqual([
      { name: "ChatGPT", sessions: 42, previousSessions: 42 },
    ]);
    expect(data.analytics?.landingPages[0]).toMatchObject({
      page: "/",
      sessions: 7 * 50,
      organicSessions: 7 * 40,
    });
  });

  it("refreshes expired tokens and marks revoked access", async () => {
    const prisma = context.app.get(PrismaService);
    const connection = await prisma.googleConnection.findFirstOrThrow();
    const sync = context.app.get(GoogleSyncService);
    const integration = await prisma.projectIntegration.findFirstOrThrow({
      where: { type: "GSC" },
    });

    // Expire the stored access token by reconnecting with a zero lifetime.
    google.state.expiresIn = 0;
    await connect(owner);
    google.state.expiresIn = 3600;
    await sync.sync(integration.id, TODAY);
    expect(
      (await prisma.projectIntegration.findUniqueOrThrow({ where: { id: integration.id } }))
        .lastError,
    ).toBeNull();

    google.state.expiresIn = 0;
    await connect(owner);
    google.state.revoked.add("refresh-1");
    await sync.sync(integration.id, TODAY);
    expect(
      await prisma.googleConnection.findUniqueOrThrow({ where: { id: connection.id } }),
    ).toMatchObject({
      status: "REVOKED",
    });
    expect(
      (await prisma.projectIntegration.findUniqueOrThrow({ where: { id: integration.id } }))
        .lastError,
    ).toMatch(/revoked/i);
    const notifications = await prisma.notification.findMany({ where: { type: "google.revoked" } });
    expect(notifications.length).toBeGreaterThan(0);
    google.state.revoked.clear();
    google.state.expiresIn = 3600;
  });

  it("removes a source with its data and disconnects the account", async () => {
    const prisma = context.app.get(PrismaService);
    await member.delete(projectApi("/integrations/gsc")).expect(204);
    expect(await prisma.gscSiteDaily.count()).toBe(0);
    const integrations = ProjectIntegrationsSchema.parse(
      (await member.get(projectApi("/integrations")).expect(200)).body,
    );
    expect(integrations.gsc).toBeNull();

    expect(await prisma.ga4PageDaily.count()).toBeGreaterThan(0);
    await member.delete(ws(`/integrations/google/${connectionId}`)).expect(403);
    await owner.delete(ws(`/integrations/google/${connectionId}`)).expect(204);
    expect(google.state.revokeCalls).toEqual(["refresh-1"]);
    expect(await prisma.projectIntegration.count()).toBe(0);
    // The GA4 source used the account: its imported data is gone too.
    expect(await prisma.ga4PageDaily.count()).toBe(0);
  });

  it("lets a workspace use its own OAuth client, checked with Google first", async () => {
    const prisma = context.app.get(PrismaService);
    const clientPath = ws("/integrations/google/client");
    const own = {
      clientId: "1234-own.apps.googleusercontent.com",
      clientSecret: "GOCSPX-own-secret",
    };
    google.state.clients.set(own.clientId, own.clientSecret);

    await member.put(clientPath).send(own).expect(403);
    await owner
      .put(clientPath)
      .send({ ...own, clientId: "https://console.cloud.google.com" })
      .expect(400);
    const wrong = await owner
      .put(clientPath)
      .send({ ...own, clientSecret: "GOCSPX-wrong-secret" })
      .expect(422);
    expect(wrong.body.detail).toMatch(/Copy both again/);
    expect(await prisma.googleOAuthClient.count()).toBe(0);

    // An account connected with the installation's client, before the workspace had its own.
    await connect(owner);
    const first = await prisma.googleConnection.findFirstOrThrow();

    const saved = GoogleIntegrationsSchema.parse(
      (await owner.put(clientPath).send(own).expect(200)).body,
    );
    expect(saved).toMatchObject({
      configured: true,
      instanceClient: true,
      client: { source: "WORKSPACE", clientId: own.clientId },
    });
    expect(JSON.stringify(saved)).not.toContain(own.clientSecret);
    const stored = await prisma.googleOAuthClient.findUniqueOrThrow({
      where: { workspaceId: workspace },
    });
    expect(Buffer.from(stored.encryptedSecret).toString("utf8")).not.toContain(own.clientSecret);
    // The earlier account keeps refreshing with the client that issued its tokens.
    const clients = context.app.get(GoogleOAuthClientsService);
    expect((await clients.forConnection(first))?.source).toBe("INSTANCE");

    // New connections use the workspace's client, and their tokens refresh only with it.
    const started = await owner
      .post(ws("/integrations/google/authorize"))
      .send({ projectId: project.id })
      .expect(200);
    expect(new URL(started.body.url as string).searchParams.get("client_id")).toBe(own.clientId);
    google.state.expiresIn = 0;
    const consent = google.consent(started.body.url as string);
    const done = await owner
      .get(
        `/api/v1/integrations/google/callback?code=${consent.code}&state=${encodeURIComponent(consent.state)}`,
      )
      .expect(302);
    google.state.expiresIn = 3600;
    expect(done.headers.location).toBe(
      `${WEB_ORIGIN}/agency/example-com/search-console?google=connected`,
    );
    expect(
      await prisma.googleConnection.findUniqueOrThrow({ where: { id: first.id } }),
    ).toMatchObject({ oauthClientId: own.clientId, status: "ACTIVE" });
    await member.get(ws(`/integrations/google/${first.id}/properties`)).expect(200);

    // Replacing the client ends the accounts it connected, and flows it started.
    const pending = google.consent(
      (
        await owner
          .post(ws("/integrations/google/authorize"))
          .send({ projectId: project.id })
          .expect(200)
      ).body.url as string,
    );
    const other = {
      clientId: "5678-other.apps.googleusercontent.com",
      clientSecret: "GOCSPX-other-secret",
    };
    google.state.clients.set(other.clientId, other.clientSecret);
    const replaced = GoogleIntegrationsSchema.parse(
      (await owner.put(clientPath).send(other).expect(200)).body,
    );
    expect(replaced.connections).toEqual([
      expect.objectContaining({
        status: "REVOKED",
        lastError: expect.stringMatching(/replaced or removed/),
      }),
    ]);
    const changed = await owner
      .get(
        `/api/v1/integrations/google/callback?code=${pending.code}&state=${encodeURIComponent(pending.state)}`,
      )
      .expect(302);
    expect(changed.headers.location).toBe(
      `${WEB_ORIGIN}/agency/example-com/search-console?google=client_changed`,
    );

    // Without its own client, the workspace uses the installation's again.
    await member.delete(clientPath).expect(403);
    await owner.delete(clientPath).expect(204);
    await owner.delete(clientPath).expect(404);
    const status = GoogleIntegrationsSchema.parse(
      (await member.get(ws("/integrations/google")).expect(200)).body,
    );
    expect(status.client).toEqual({
      source: "INSTANCE",
      clientId: GOOGLE_TEST_ENV.GOOGLE_CLIENT_ID,
      verifiedAt: null,
    });
    const audit = await prisma.auditLog.findMany({
      where: { workspaceId: workspace, action: { startsWith: "google.client" } },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      "google.client_saved",
      "google.client_saved",
      "google.client_removed",
    ]);
  });
});
