import { Test } from "@nestjs/testing";
import {
  ProblemDetailsSchema,
  ProjectDetailSchema,
  ProviderCredentialSchema,
  UsageSummarySchema,
  type ProjectDetail,
} from "@seo-geo/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DATAFORSEO_OPTIONS } from "../src/credentials/dataforseo.gateway.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { TaskRegistry } from "../src/tasks/task-registry.js";
import { TaskService } from "../src/tasks/task.service.js";
import { UsageService } from "../src/usage/usage.service.js";
import { WorkerModule } from "../src/worker.module.js";
import {
  TEST_SERVER_URL,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";
import { testConfig } from "./support/config.js";
import { GOOD_LOGIN, UNREACHABLE_LOGIN, fakeDataForSeo } from "./support/dataforseo.js";

const PASSWORD = "a long enough password";

describe.skipIf(!TEST_SERVER_URL)("platform core", () => {
  const dataForSeo = fakeDataForSeo();
  let context: IntegrationApp;
  let owner: Agent;
  let member: Agent;
  let viewer: Agent;
  let outsider: Agent;
  let workspace: string;
  let otherWorkspace: string;
  let project: ProjectDetail;

  const api = (path: string) => `/api/v1/workspaces/${workspace}${path}`;

  async function createWorkspace(agent: Agent, slug: string): Promise<string> {
    const response = await agent
      .post("/api/auth/organization/create")
      .send({ name: slug, slug })
      .expect(200);
    return response.body.id as string;
  }

  async function join(email: string, role: string): Promise<Agent> {
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
      // The cloud edition has open sign-up, which keeps this setup short.
      env: { DEPLOYMENT_MODE: "cloud", SMTP_HOST: "smtp.invalid" },
      overrides: [{ provide: DATAFORSEO_OPTIONS, useValue: { fetch: dataForSeo.fetch } }],
    });
    owner = await signUpVerified(context, {
      name: "Owner",
      email: "owner@example.com",
      password: PASSWORD,
    });
    workspace = await createWorkspace(owner, "agency");
    member = await join("member@example.com", "member");
    viewer = await join("viewer@example.com", "viewer");
    outsider = await signUpVerified(context, {
      name: "Outsider",
      email: "outsider@example.com",
      password: PASSWORD,
    });
    otherWorkspace = await createWorkspace(outsider, "other");
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  describe("projects", () => {
    it("creates a project with its own brand and competitors", async () => {
      const response = await owner
        .post(api("/projects"))
        .send({
          name: "Örnek",
          domain: "https://www.Ornek.com.tr/blog",
          locationCode: 2792,
          languageCode: "tr",
          timezone: "Europe/Istanbul",
          competitors: [{ name: "Rakip", domains: ["www.rakip.com.tr", "rakip.com.tr/urunler"] }],
        })
        .expect(201);

      project = ProjectDetailSchema.parse(response.body);
      expect(project).toMatchObject({
        slug: "ornek-com-tr",
        domain: "ornek.com.tr",
        device: "DESKTOP",
        timezone: "Europe/Istanbul",
      });
      expect(project.brands).toEqual([
        expect.objectContaining({
          kind: "OWN",
          name: "Örnek",
          domains: ["ornek.com.tr"],
          colorSlot: 1,
        }),
        expect.objectContaining({ kind: "COMPETITOR", domains: ["rakip.com.tr"], colorSlot: 2 }),
      ]);
    });

    it("derives unique slugs and rejects taken or invalid ones", async () => {
      const base = { name: "Again", locationCode: 2792, languageCode: "tr" };
      const second = await owner
        .post(api("/projects"))
        .send({ ...base, domain: "ornek.com.tr" })
        .expect(201);
      expect(second.body.slug).toBe("ornek-com-tr-2");

      const taken = await owner
        .post(api("/projects"))
        .send({ ...base, domain: "x.com", slug: "ornek-com-tr" })
        .expect(409);
      expect(ProblemDetailsSchema.parse(taken.body).errors?.[0]?.path).toBe("slug");

      for (const domain of ["localhost", "10.0.0.1", "not a domain"]) {
        const invalid = await owner
          .post(api("/projects"))
          .send({ ...base, domain })
          .expect(400);
        expect(ProblemDetailsSchema.parse(invalid.body).errors?.[0]?.path).toBe("domain");
      }
    });

    it("lets members configure projects and viewers only read them", async () => {
      await member
        .patch(api(`/projects/${project.id}`))
        .send({ device: "MOBILE" })
        .expect(200);
      await member
        .post(api("/projects"))
        .send({ name: "No", domain: "no.com", locationCode: 2792, languageCode: "tr" })
        .expect(403);
      await viewer
        .patch(api(`/projects/${project.id}`))
        .send({ name: "No" })
        .expect(403);

      const read = await viewer.get(api(`/projects/${project.id}`)).expect(200);
      expect(read.body.device).toBe("MOBILE");
    });

    it("caps competitors at seven and reuses freed color slots", async () => {
      for (let index = 2; index <= 7; index++) {
        await member
          .post(api(`/projects/${project.id}/brands`))
          .send({ name: `Rival ${index}`, domains: [`rival${index}.com`] })
          .expect(201);
      }
      await member
        .post(api(`/projects/${project.id}/brands`))
        .send({ name: "One too many", domains: ["many.com"] })
        .expect(409);

      const detail = ProjectDetailSchema.parse(
        (await member.get(api(`/projects/${project.id}`)).expect(200)).body,
      );
      expect(detail.brands.map((brand) => brand.colorSlot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const own = detail.brands.find((brand) => brand.kind === "OWN");
      const third = detail.brands.find((brand) => brand.colorSlot === 3);
      await member.delete(api(`/projects/${project.id}/brands/${own?.id}`)).expect(409);
      await member.delete(api(`/projects/${project.id}/brands/${third?.id}`)).expect(204);
      const replacement = await member
        .post(api(`/projects/${project.id}/brands`))
        .send({ name: "Newcomer", domains: ["https://shop.newcomer.co.uk"] })
        .expect(201);
      expect(replacement.body).toMatchObject({ colorSlot: 3, domains: ["newcomer.co.uk"] });
    });

    it("archives, restores and deletes projects with an audit trail", async () => {
      const temporary = await owner
        .post(api("/projects"))
        .send({ name: "Temp", domain: "temp.io", locationCode: 2840, languageCode: "en" })
        .expect(201);
      const id = temporary.body.id as string;

      await owner.post(api(`/projects/${id}/archive`)).expect(200);
      const active = await owner.get(api("/projects")).expect(200);
      expect(active.body.data.map((p: { id: string }) => p.id)).not.toContain(id);
      const all = await owner.get(api("/projects?archived=true")).expect(200);
      expect(all.body.data.map((p: { id: string }) => p.id)).toContain(id);

      await owner.post(api(`/projects/${id}/restore`)).expect(200);
      await member.delete(api(`/projects/${id}`)).expect(403);
      await owner.delete(api(`/projects/${id}`)).expect(204);
      await owner.get(api(`/projects/${id}`)).expect(404);

      const audit = await owner.get(api("/audit-log")).expect(200);
      const actions = audit.body.data
        .filter((entry: { targetId: string }) => entry.targetId === id)
        .map((entry: { action: string }) => entry.action);
      expect(actions).toEqual([
        "project.deleted",
        "project.restored",
        "project.archived",
        "project.created",
      ]);
      expect(audit.body.data[0].actor).toMatchObject({ email: "owner@example.com" });
      await viewer.get(api("/audit-log")).expect(403);
    });
  });

  describe("provider credentials", () => {
    let credentialId: string;

    it("does not store credentials DataForSEO rejects or cannot check", async () => {
      await viewer.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(403);

      const rejected = await owner
        .put(api("/credentials/dataforseo"))
        .send({ login: GOOD_LOGIN.login, password: "wrong" })
        .expect(422);
      expect(ProblemDetailsSchema.parse(rejected.body).code).toBe("provider_error");

      await owner.put(api("/credentials/dataforseo")).send(UNREACHABLE_LOGIN).expect(502);

      const list = await viewer.get(api("/credentials")).expect(200);
      expect(list.body.data).toEqual([]);
    });

    it("verifies, encrypts and stores working credentials without returning them", async () => {
      const response = await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);

      const credential = ProviderCredentialSchema.parse(response.body);
      credentialId = credential.id;
      expect(credential).toMatchObject({
        provider: "DATAFORSEO",
        status: "VALID",
        details: { login: GOOD_LOGIN.login, balanceUsd: 42.5 },
      });
      expect(JSON.stringify(response.body)).not.toContain(GOOD_LOGIN.password);

      const row = await context.app
        .get(PrismaService)
        .providerCredential.findUniqueOrThrow({ where: { id: credentialId } });
      expect(Buffer.from(row.encryptedSecret).toString("latin1")).not.toContain(
        GOOD_LOGIN.password,
      );
    });

    it("refreshes the balance and records changes in the audit log", async () => {
      dataForSeo.state.balance = 12.25;
      const verified = await owner.post(api(`/credentials/${credentialId}/verify`)).expect(200);
      expect(verified.body.details.balanceUsd).toBe(12.25);

      await owner.delete(api(`/credentials/${credentialId}`)).expect(204);
      const audit = await owner.get(api("/audit-log")).expect(200);
      const actions = audit.body.data.map((entry: { action: string }) => entry.action);
      expect(actions).toContain("credential.saved");
      expect(actions).toContain("credential.deleted");
      expect(JSON.stringify(audit.body)).not.toContain(GOOD_LOGIN.password);
    });
  });

  describe("usage and budget", () => {
    it("summarizes spend and warns owners when a threshold is crossed", async () => {
      const usage = context.app.get(UsageService);
      await member
        .put(api("/budget"))
        .send({ monthlyLimitUsd: 1, alertThresholds: [50, 100] })
        .expect(403);
      await owner
        .put(api("/budget"))
        .send({ monthlyLimitUsd: 1, alertThresholds: [100, 50] })
        .expect(200);

      await usage.record({
        workspaceId: workspace,
        provider: "DATAFORSEO",
        operation: "serp.organic",
        costUsd: "0.3",
      });
      await usage.record({
        workspaceId: workspace,
        provider: "DATAFORSEO",
        operation: "serp.organic",
        costUsd: "0.3",
      });

      const summary = UsageSummarySchema.parse((await viewer.get(api("/usage")).expect(200)).body);
      expect(summary).toMatchObject({
        totalUsd: 0.6,
        byProvider: [{ provider: "DATAFORSEO", costUsd: 0.6, operations: 2 }],
        budget: { monthlyLimitUsd: 1, hardStop: true, alertThresholds: [50, 100] },
        budgetUsedPercent: 60,
      });

      const notifications = await owner.get(api("/notifications")).expect(200);
      expect(notifications.body.unread).toBe(1);
      expect(notifications.body.data[0]).toMatchObject({ type: "budget.threshold" });
      const memberNotifications = await member.get(api("/notifications")).expect(200);
      expect(memberNotifications.body.unread).toBe(0);

      await owner.post(api("/notifications/read-all")).expect(204);
      expect((await owner.get(api("/notifications")).expect(200)).body.unread).toBe(0);
    });

    it("blocks paid work that would exceed a hard budget", async () => {
      const usage = context.app.get(UsageService);
      await expect(usage.assertCanSpend(workspace, "0.5")).rejects.toMatchObject({
        code: "budget_exceeded",
      });
      await expect(usage.assertCanSpend(workspace, "0.3")).resolves.toBeUndefined();

      await owner.put(api("/budget")).send({ monthlyLimitUsd: 1, hardStop: false }).expect(200);
      await expect(usage.assertCanSpend(workspace, "5")).resolves.toBeUndefined();
    });
  });

  describe("tasks", () => {
    it("runs queued tasks in the worker and reports the outcome", async () => {
      const workerConfig = testConfig({
        DATABASE_URL: context.config.databaseUrl,
        APP_MODE: "worker",
      });
      const moduleRef = await Test.createTestingModule({
        imports: [WorkerModule.forRoot(workerConfig, { pollingIntervalSeconds: 0.5 })],
      }).compile();
      const registry = moduleRef.get(TaskRegistry);
      registry.registerTask("test.echo", {
        handler: async ({ input, progress }) => {
          await progress(50);
          return { result: { echoed: input }, costUsd: "0.0012" };
        },
      });
      registry.registerTask("test.fail", {
        handler: async () => {
          throw new Error("provider exploded");
        },
        queue: { retryLimit: 0 },
      });
      const worker = await moduleRef.init();

      try {
        const tasks = context.app.get(TaskService);
        const { task, created } = await tasks.create({
          workspaceId: workspace,
          type: "test.echo",
          input: { hello: "world" },
          idempotencyKey: "echo-1",
        });
        expect(created).toBe(true);
        const replay = await tasks.create({
          workspaceId: workspace,
          type: "test.echo",
          input: { hello: "again" },
          idempotencyKey: "echo-1",
        });
        expect(replay).toMatchObject({ created: false, task: { id: task.id } });

        const done = await waitFor(async () => {
          const response = await viewer.get(api(`/tasks/${task.id}`)).expect(200);
          return response.body.status === "succeeded" ? response.body : null;
        });
        expect(done).toMatchObject({
          status: "succeeded",
          progress: 100,
          result: { echoed: { hello: "world" } },
          actualCostUsd: 0.0012,
        });

        const failing = await tasks.create({ workspaceId: workspace, type: "test.fail" });
        const failed = await waitFor(async () => {
          const response = await viewer.get(api(`/tasks/${failing.task.id}`)).expect(200);
          return response.body.status === "failed" ? response.body : null;
        });
        expect(failed.error).toEqual({ code: "task_failed", message: "provider exploded" });

        const list = await viewer.get(api("/tasks?status=succeeded,failed")).expect(200);
        expect(list.body.data.map((item: { id: string }) => item.id)).toEqual([
          failing.task.id,
          task.id,
        ]);
        await member.post(api(`/tasks/${task.id}/cancel`)).expect(409);
      } finally {
        await worker.close();
      }
    }, 60_000);

    it("cancels tasks that have not started", async () => {
      const tasks = context.app.get(TaskService);
      const { task } = await tasks.create({ workspaceId: workspace, type: "test.never" });

      await viewer.post(api(`/tasks/${task.id}/cancel`)).expect(403);
      const canceled = await member.post(api(`/tasks/${task.id}/cancel`)).expect(200);
      expect(canceled.body.status).toBe("canceled");
    });
  });

  describe("tenant isolation", () => {
    it("never serves one workspace's data to another workspace", async () => {
      const prisma = context.app.get(PrismaService);
      const task = await prisma.task.findFirstOrThrow({ where: { workspaceId: workspace } });
      await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);
      const credential = await prisma.providerCredential.findFirstOrThrow({
        where: { workspaceId: workspace },
      });
      const notification = await prisma.notification.findFirstOrThrow({
        where: { workspaceId: workspace },
      });
      const brand = project.brands[0];
      const own = `/api/v1/workspaces/${workspace}`;
      const theirs = `/api/v1/workspaces/${otherWorkspace}`;

      // The outsider is not a member of the workspace…
      for (const path of ["", "/projects", "/credentials", "/usage", "/tasks"]) {
        await outsider.get(own + path).expect(404);
      }
      // …and cannot reach its rows through their own workspace either.
      await outsider.get(`${theirs}/projects/${project.id}`).expect(404);
      await outsider.patch(`${theirs}/projects/${project.id}`).send({ name: "x" }).expect(404);
      await outsider.delete(`${theirs}/projects/${project.id}`).expect(404);
      await outsider
        .patch(`${theirs}/projects/${project.id}/brands/${brand?.id}`)
        .send({ name: "x" })
        .expect(404);
      await outsider.post(`${theirs}/credentials/${credential.id}/verify`).expect(404);
      await outsider.delete(`${theirs}/credentials/${credential.id}`).expect(404);
      await outsider.get(`${theirs}/tasks/${task.id}`).expect(404);
      await outsider.post(`${theirs}/notifications/${notification.id}/read`).expect(404);

      const untouched = await owner.get(`${own}/projects/${project.id}`).expect(200);
      expect(untouched.body.name).toBe(project.name);
    });
  });
});

async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 20_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value !== null) return value;
    if (Date.now() > deadline) throw new Error("Timed out waiting for the condition");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
