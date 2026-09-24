import { Controller, Get, Module } from "@nestjs/common";
import { InstanceInfoSchema, MeResponseSchema, ProblemDetailsSchema } from "@seo-geo/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RequireRole, WorkspaceScoped } from "../src/auth/decorators.js";
import {
  TEST_SERVER_URL,
  browser,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";

@WorkspaceScoped()
@Controller("workspaces/:workspaceId/test")
class RoleTestController {
  @Get("view")
  view() {
    return { ok: true };
  }

  @Get("admin")
  @RequireRole("admin")
  admin() {
    return { ok: true };
  }
}

@Module({ controllers: [RoleTestController] })
class RoleTestModule {}

const owner = { name: "Ayşe Owner", email: "ayse@example.com", password: "correct horse battery" };
const viewer = {
  name: "Bora Viewer",
  email: "bora@example.com",
  password: "another good password",
};

describe.skipIf(!TEST_SERVER_URL)("authentication and workspaces", () => {
  let context: IntegrationApp;
  let ownerAgent: Agent;
  let workspaceId: string;

  beforeAll(async () => {
    context = await createIntegrationApp({ modules: [RoleTestModule] });
  }, 60_000);

  afterAll(async () => {
    await context?.close();
  });

  const instance = async () =>
    InstanceInfoSchema.parse((await browser(context.app).get("/api/v1/instance").expect(200)).body);

  it("lets the first person on a self-hosted server sign up", async () => {
    expect(await instance()).toMatchObject({
      deploymentMode: "selfhost",
      signUp: "first-user",
      emailDelivery: true,
    });
  });

  it("requires a verified email before signing in", async () => {
    const agent = browser(context.app);
    await agent.post("/api/auth/sign-up/email").send(owner).expect(200);

    const signIn = await agent
      .post("/api/auth/sign-in/email")
      .send({ email: owner.email, password: owner.password });
    expect(signIn.status).toBe(403);

    await agent.get(context.mailer.lastLinkPath(owner.email)).expect(302);
    const me = MeResponseSchema.parse((await agent.get("/api/v1/me").expect(200)).body);
    expect(me.user).toMatchObject({ email: owner.email, emailVerified: true });
    expect(me.workspaces).toEqual([]);
    ownerAgent = agent;
  });

  it("closes sign-up once the server has a user", async () => {
    expect((await instance()).signUp).toBe("invite-only");

    const response = await browser(context.app)
      .post("/api/auth/sign-up/email")
      .send({ name: "Stranger", email: "stranger@example.com", password: "a long password 1" });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("SIGN_UP_INVITE_ONLY");
  });

  it("makes the creator the owner of a new workspace", async () => {
    const created = await ownerAgent
      .post("/api/auth/organization/create")
      .send({ name: "Ajans", slug: "ajans" })
      .expect(200);
    workspaceId = created.body.id;

    const me = MeResponseSchema.parse((await ownerAgent.get("/api/v1/me").expect(200)).body);
    expect(me.workspaces).toEqual([
      { id: workspaceId, name: "Ajans", slug: "ajans", logo: null, role: "owner" },
    ]);
    await ownerAgent.get(`/api/v1/workspaces/${workspaceId}`).expect(200);
    await ownerAgent.get(`/api/v1/workspaces/${workspaceId}/test/admin`).expect(200);
  });

  it("records the client address resolved from trusted proxies", async () => {
    // The request comes from loopback (trusted), so the rightmost forwarded address is the
    // client; anything to its left may have been written by the client itself.
    const created = await ownerAgent
      .post("/api/auth/organization/create")
      .set("X-Forwarded-For", "203.0.113.9, 198.51.100.7")
      .send({ name: "Proxy Test", slug: "proxy-test" })
      .expect(200);
    const audit = await ownerAgent
      .get(`/api/v1/workspaces/${created.body.id}/audit-log`)
      .set("X-Forwarded-For", "203.0.113.9")
      .expect(200);
    expect(audit.body.data).toMatchObject([{ action: "workspace.created", ip: "198.51.100.7" }]);
  });

  it("rejects workspace addresses that clash with the app's routes", async () => {
    for (const slug of ["sign-in", "Bad Slug", "-x"]) {
      const response = await ownerAgent
        .post("/api/auth/organization/create")
        .send({ name: "Clash", slug });
      expect(response.status).toBe(400);
    }
  });

  it("lets invited people sign up and join with the invited role", async () => {
    await ownerAgent
      .post("/api/auth/organization/invite-member")
      .send({ email: viewer.email, role: "viewer", organizationId: workspaceId })
      .expect(200);
    const invitationPath = context.mailer.lastLinkPath(viewer.email);
    const invitationId = invitationPath.split("/").pop();
    expect(invitationPath).toMatch(/^\/invite\//);

    const agent = await signUpVerified(context, viewer);
    await agent.post("/api/auth/organization/accept-invitation").send({ invitationId }).expect(200);

    const workspace = await agent.get(`/api/v1/workspaces/${workspaceId}`).expect(200);
    expect(workspace.body).toMatchObject({ id: workspaceId, role: "viewer" });
  });

  it("enforces the minimum role per route", async () => {
    const agent = browser(context.app);
    await agent
      .post("/api/auth/sign-in/email")
      .send({ email: viewer.email, password: viewer.password })
      .expect(200);

    await agent.get(`/api/v1/workspaces/${workspaceId}/test/view`).expect(200);
    const denied = await agent.get(`/api/v1/workspaces/${workspaceId}/test/admin`).expect(403);
    expect(ProblemDetailsSchema.parse(denied.body).code).toBe("forbidden");

    // Better Auth applies the same roles to workspace management.
    const invite = await agent
      .post("/api/auth/organization/invite-member")
      .send({ email: "someone@example.com", role: "member", organizationId: workspaceId });
    expect(invite.status).toBe(403);
  });

  it("hides workspaces from non-members", async () => {
    const other = await ownerAgent
      .post("/api/auth/organization/create")
      .send({ name: "Private", slug: "private" })
      .expect(200);

    const agent = browser(context.app);
    await agent
      .post("/api/auth/sign-in/email")
      .send({ email: viewer.email, password: viewer.password })
      .expect(200);

    for (const id of [other.body.id, "00000000-0000-7000-8000-000000000000", "not-a-uuid"]) {
      const response = await agent.get(`/api/v1/workspaces/${id}`).expect(404);
      expect(ProblemDetailsSchema.parse(response.body).code).toBe("not_found");
    }
  });

  it("records membership changes with the acting user in the audit log", async () => {
    const members = await ownerAgent
      .get(`/api/auth/organization/list-members?organizationId=${workspaceId}`)
      .expect(200);
    const viewerMember = members.body.members.find(
      (member: { user: { email: string } }) => member.user.email === viewer.email,
    );
    await ownerAgent
      .post("/api/auth/organization/update-member-role")
      .send({ memberId: viewerMember.id, role: "member", organizationId: workspaceId })
      .expect(200);

    const invitation = await ownerAgent
      .post("/api/auth/organization/invite-member")
      .send({ email: "later@example.com", role: "member", organizationId: workspaceId })
      .expect(200);
    await ownerAgent
      .post("/api/auth/organization/cancel-invitation")
      .send({ invitationId: invitation.body.id })
      .expect(200);

    const viewerAgent = browser(context.app);
    await viewerAgent
      .post("/api/auth/sign-in/email")
      .send({ email: viewer.email, password: viewer.password })
      .expect(200);
    await viewerAgent
      .post("/api/auth/organization/leave")
      .send({ organizationId: workspaceId })
      .expect(200);

    const audit = await ownerAgent.get(`/api/v1/workspaces/${workspaceId}/audit-log`).expect(200);
    const entries = (
      audit.body.data as {
        action: string;
        actor: { email: string } | null;
        metadata: Record<string, string>;
      }[]
    )
      .map(({ action, actor, metadata }) => ({ action, actor: actor?.email, metadata }))
      .reverse();
    expect(entries).toEqual([
      {
        action: "workspace.created",
        actor: owner.email,
        metadata: { name: "Ajans", slug: "ajans" },
      },
      {
        action: "invitation.created",
        actor: owner.email,
        metadata: { email: viewer.email, role: "viewer" },
      },
      {
        action: "member.joined",
        actor: viewer.email,
        metadata: { email: viewer.email, role: "viewer" },
      },
      {
        action: "member.role_changed",
        actor: owner.email,
        metadata: { email: viewer.email, from: "viewer", to: "member" },
      },
      {
        action: "invitation.created",
        actor: owner.email,
        metadata: { email: "later@example.com", role: "member" },
      },
      {
        action: "invitation.canceled",
        actor: owner.email,
        metadata: { email: "later@example.com" },
      },
      { action: "member.left", actor: viewer.email, metadata: {} },
    ]);
  });

  it("accepts personal API keys in the x-api-key header", async () => {
    const created = await ownerAgent
      .post("/api/auth/api-key/create")
      .send({ name: "CI script", expiresIn: 60 * 60 * 24 })
      .expect(200);
    const key = created.body.key as string;
    expect(key).toMatch(/^sg_/);

    const withKey = await request(context.app.getHttpServer())
      .get("/api/v1/me")
      .set("x-api-key", key)
      .expect(200);
    expect(MeResponseSchema.parse(withKey.body).user.email).toBe(owner.email);
    await request(context.app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/audit-log`)
      .set("x-api-key", key)
      .expect(200);

    await ownerAgent.post("/api/auth/api-key/delete").send({ keyId: created.body.id }).expect(200);
    await request(context.app.getHttpServer()).get("/api/v1/me").set("x-api-key", key).expect(401);
  });

  it("resets a forgotten password through the emailed link", async () => {
    const agent = browser(context.app);
    await agent
      .post("/api/auth/request-password-reset")
      .send({ email: owner.email, redirectTo: "http://localhost:3000/reset-password" })
      .expect(200);

    const redirect = await agent.get(context.mailer.lastLinkPath(owner.email)).expect(302);
    const token = new URL(redirect.headers.location as string).searchParams.get("token");
    expect(token).toBeTruthy();

    const newPassword = "a brand new passphrase";
    await agent.post("/api/auth/reset-password").send({ newPassword, token }).expect(200);
    await agent
      .post("/api/auth/sign-in/email")
      .send({ email: owner.email, password: owner.password })
      .expect(401);
    await agent
      .post("/api/auth/sign-in/email")
      .send({ email: owner.email, password: newPassword })
      .expect(200);
  });
});
