import {
  CreatedWorkspaceApiKeySchema,
  MeResponseSchema,
  WorkspaceApiKeyListSchema,
  type ApiScope,
} from "@seo-geo/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaService } from "../src/database/prisma.service.js";
import {
  TEST_SERVER_URL,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";

const PASSWORD = "a long enough password";

describe.skipIf(!TEST_SERVER_URL)("workspace API keys", () => {
  let context: IntegrationApp;
  let owner: Agent;
  let member: Agent;
  let viewer: Agent;
  let workspace: string;
  let other: string;

  const api = (path: string, workspaceId = workspace) => `/api/v1/workspaces/${workspaceId}${path}`;
  const http = () => request(context.app.getHttpServer());
  const withKey = (key: string) => ({
    get: (path: string) => http().get(path).set("x-api-key", key),
    post: (path: string) => http().post(path).set("x-api-key", key),
    put: (path: string) => http().put(path).set("x-api-key", key),
  });

  async function createKey(agent: Agent, scopes: ApiScope[], name = "Script") {
    const response = await agent
      .post(api("/api-keys"))
      .send({ name, scopes, expiresInDays: 30 })
      .expect(201);
    return CreatedWorkspaceApiKeySchema.parse(response.body);
  }

  async function join(email: string, role: "member" | "viewer"): Promise<Agent> {
    const agent = await signUpVerified(context, { name: email, email, password: PASSWORD });
    await owner
      .post("/api/auth/organization/invite-member")
      .send({ email, role, organizationId: workspace })
      .expect(200);
    const invitationId = context.mailer.lastLinkPath(email).split("/").pop();
    await agent.post("/api/auth/organization/accept-invitation").send({ invitationId }).expect(200);
    return agent;
  }

  beforeAll(async () => {
    context = await createIntegrationApp({
      env: { DEPLOYMENT_MODE: "cloud", SMTP_HOST: "smtp.invalid" },
    });
    owner = await signUpVerified(context, {
      name: "Owner",
      email: "owner@example.com",
      password: PASSWORD,
    });
    const create = async (name: string, slug: string) =>
      (await owner.post("/api/auth/organization/create").send({ name, slug }).expect(200)).body
        .id as string;
    other = await create("Other", "other");
    workspace = await create("Agency", "agency");
    member = await join("member@example.com", "member");
    viewer = await join("viewer@example.com", "viewer");
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it("creates a key for one workspace, shown once", async () => {
    await owner
      .post(api("/api-keys"))
      .send({ name: "Script", scopes: [], expiresInDays: 30 })
      .expect(400);
    const key = await createKey(owner, ["write", "read"]);
    expect(key.key).toMatch(/^sg_/);
    expect(key).toMatchObject({
      name: "Script",
      scopes: ["read", "write"],
      own: true,
      createdBy: { email: "owner@example.com" },
      lastUsedAt: null,
    });
    const list = WorkspaceApiKeyListSchema.parse(
      (await owner.get(api("/api-keys")).expect(200)).body,
    );
    expect(list.data.map((entry) => entry.id)).toEqual([key.id]);
    expect(JSON.stringify(list)).not.toContain(key.key);
  });

  it("limits a key to its workspace and scopes", async () => {
    const read = await createKey(owner, ["read"], "Reports");
    const client = withKey(read.key);

    await client.get(api("/projects")).expect(200);
    // Other workspaces of the same user do not exist for the key.
    await client.get(api("/projects", other)).expect(404);
    const me = MeResponseSchema.parse((await client.get("/api/v1/me").expect(200)).body);
    expect(me.workspaces.map((entry) => entry.id)).toEqual([workspace]);

    // Writing needs the write scope.
    const forbidden = await client
      .post(api("/projects"))
      .send({ name: "Blog", domain: "blog.example", locationCode: 2792, languageCode: "tr" })
      .expect(403);
    expect(forbidden.body.detail).toBe("This API key does not have the write scope.");

    // Bearer tokens work too (MCP clients send them).
    await http().get(api("/projects")).set("authorization", `Bearer ${read.key}`).expect(200);
  });

  it("needs run:paid for paid work and a session for credentials, budgets and keys", async () => {
    const writer = await createKey(owner, ["read", "write"], "Writer");
    const client = withKey(writer.key);
    const project = await client
      .post(api("/projects"))
      .send({ name: "Blog", domain: "blog.example", locationCode: 2792, languageCode: "tr" })
      .expect(201);
    const tracker = api(`/projects/${project.body.id}/rank-tracker`);

    // Quotes only read; tracking starts paid checks.
    await client
      .post(`${tracker}/keywords/quote`)
      .send({ keywords: ["kahve"] })
      .expect(200);
    const paid = await client
      .post(`${tracker}/keywords`)
      .send({ keywords: ["kahve"] })
      .expect(403);
    expect(paid.body.detail).toBe("This API key does not have the run:paid scope.");

    await client
      .put(api("/credentials/dataforseo"))
      .send({ login: "a@example.com", password: "secret" })
      .expect(403);
    await client.put(api("/budget")).send({ monthlyLimitUsd: 1000 }).expect(403);
    await client.get(api("/api-keys")).expect(403);
    await client
      .post(api("/api-keys"))
      .send({ name: "Escalate", scopes: ["run:paid"] })
      .expect(403);

    // Actions through a key are audited with the key.
    const prisma = context.app.get(PrismaService);
    const entry = await prisma.auditLog.findFirst({
      where: { workspaceId: workspace, action: "project.created" },
    });
    expect(entry?.actorApiKeyId).toBe(writer.id);
  });

  it("never lets a key use the account endpoints", async () => {
    const key = await createKey(owner, ["read", "write", "run:paid"], "Full");
    const escalate = await http()
      .post("/api/auth/api-key/create")
      .set("x-api-key", key.key)
      .send({ name: "Unlimited" })
      .expect(403);
    expect(escalate.body.detail).toContain("API keys cannot be used for account endpoints");
    await http()
      .post("/api/auth/organization/invite-member")
      .set("authorization", `Bearer ${key.key}`)
      .send({ email: "intruder@example.com", role: "admin", organizationId: workspace })
      .expect(403);
  });

  it("never gives a key more than its creator's role", async () => {
    const key = await createKey(viewer, ["read", "write", "run:paid"], "Viewer");
    const client = withKey(key.key);
    await client.get(api("/projects")).expect(200);
    await client
      .post(api("/projects"))
      .send({ name: "Shop", domain: "shop.example", locationCode: 2792, languageCode: "tr" })
      .expect(403);
  });

  it("shows owners every key and others their own; revoked keys stop working", async () => {
    const own = await createKey(member, ["read"], "Member key");
    const memberList = WorkspaceApiKeyListSchema.parse(
      (await member.get(api("/api-keys")).expect(200)).body,
    );
    expect(memberList.data.map((entry) => entry.name)).toEqual(["Member key"]);
    const ownerList = WorkspaceApiKeyListSchema.parse(
      (await owner.get(api("/api-keys")).expect(200)).body,
    );
    expect(ownerList.data.map((entry) => [entry.name, entry.own])).toContainEqual([
      "Member key",
      false,
    ]);

    // Members cannot revoke other people's keys; owners can.
    const ownersKey = ownerList.data.find((entry) => entry.name === "Script");
    await member.delete(api(`/api-keys/${ownersKey?.id}`)).expect(404);
    await withKey(own.key).get(api("/projects")).expect(200);
    await owner.delete(api(`/api-keys/${own.id}`)).expect(204);
    await withKey(own.key).get(api("/projects")).expect(401);

    const prisma = context.app.get(PrismaService);
    const revoked = await prisma.auditLog.findFirst({
      where: { workspaceId: workspace, action: "api_key.revoked" },
    });
    expect(revoked?.metadata).toEqual({ name: "Member key" });
  });

  it("allows more than ten requests a day per key", async () => {
    const key = await createKey(owner, ["read"], "Busy");
    for (let index = 0; index < 12; index++) {
      await withKey(key.key).get(api("/projects")).expect(200);
    }
    // Personal keys too.
    const personal = await owner
      .post("/api/auth/api-key/create")
      .send({ name: "Personal" })
      .expect(200);
    for (let index = 0; index < 12; index++) {
      await withKey(personal.body.key as string)
        .get("/api/v1/me")
        .expect(200);
    }
  });
});
