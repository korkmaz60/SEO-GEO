import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  AuditPageListSchema,
  AuditRunSchema,
  ProjectDetailSchema,
  SiteAuditOverviewSchema,
  type ProjectDetail,
} from "@seo-geo/contracts";
import { createSafeFetcher, type SafeFetcher } from "@seo-geo/core/net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SafeFetcherService } from "../src/net/safe-fetcher.service.js";
import { SiteAuditService } from "../src/site-audit/site-audit.service.js";
import {
  TEST_SERVER_URL,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";

const PASSWORD = "a long enough password";
const text = (count: number) => Array.from({ length: count }, (_, i) => `söz${i}`).join(" ");
const page = (title: string, body: string, head = "") =>
  `<!doctype html><html lang="tr"><head><title>${title}</title><meta name="viewport" content="width=device-width"><meta name="description" content="${title} açıklaması"><link rel="canonical" href="PATH">${head}<script type="application/ld+json">{"@type":"WebPage"}</script></head><body><h1>${title}</h1><p>${text(250)}</p>${body}</body></html>`;

/** The site under audit; tests change it between runs. */
const site: Record<string, string | { status: number; location?: string }> = {};

function resetSite(): void {
  for (const key of Object.keys(site)) delete site[key];
  Object.assign(site, {
    "/": page(
      "Ana sayfa başlığı burada",
      '<a href="/a">A</a><a href="/b">B</a><a href="/kirik">K</a>',
    ),
    "/a": page("Birinci sayfa başlığı", '<a href="/">Ana</a>'),
    "/b": page("İkinci sayfa başlığı", '<a href="/eski">Eski</a>'),
    "/eski": { status: 301, location: "/a" },
    "/kirik": { status: 404 },
    "/robots.txt": "User-agent: *\nAllow: /\n",
    "/llms.txt": "# Örnek\n> Kahve makineleri",
  });
}

describe.skipIf(!TEST_SERVER_URL)("site audit", () => {
  let server: Server;
  let port: number;
  let fetcher: SafeFetcher;
  let context: IntegrationApp;
  let owner: Agent;
  let viewer: Agent;
  let workspace: string;
  let project: ProjectDetail;

  const api = (path: string) =>
    `/api/v1/workspaces/${workspace}/projects/${project.id}/site-audit${path}`;

  /** Runs the queued audit's task the way the worker would. */
  async function runQueuedAudit(runId: string): Promise<void> {
    await context.app.get(SiteAuditService).execute({
      taskId: "00000000-0000-7000-8000-000000000000",
      workspaceId: workspace,
      projectId: project.id,
      input: { runId },
      signal: new AbortController().signal,
      progress: async () => {},
    });
  }

  beforeAll(async () => {
    resetSite();
    server = createServer((request, response) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      const entry = site[path];
      if (entry === undefined) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
      } else if (typeof entry === "string") {
        const type = path.endsWith(".txt") ? "text/plain" : "text/html; charset=utf-8";
        response.writeHead(200, { "content-type": type });
        response.end(entry.replace("PATH", `https://site.test${path}`));
      } else {
        response.writeHead(entry.status, entry.location ? { location: entry.location } : {});
        response.end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    fetcher = createSafeFetcher({
      lookup: async () => [{ address: "127.0.0.1", family: 4 }],
      isAllowedAddress: (address) => address === "127.0.0.1",
      allowedPorts: [port],
    });
    // Every https://site.test URL is served by the local test server.
    const localFetcher = {
      fetch: (url: string | URL, options?: object) =>
        fetcher.fetch(
          String(url).replace(/^https?:\/\/site\.test(:\d+)?/, `http://site.test:${port}`),
          options,
        ),
      onApplicationShutdown: async () => {},
    };

    context = await createIntegrationApp({
      env: { DEPLOYMENT_MODE: "cloud", SMTP_HOST: "smtp.invalid" },
      overrides: [{ provide: SafeFetcherService, useValue: localFetcher }],
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
    viewer = await signUpVerified(context, {
      name: "Viewer",
      email: "viewer@example.com",
      password: PASSWORD,
    });
    await owner
      .post("/api/auth/organization/invite-member")
      .send({ email: "viewer@example.com", role: "viewer", organizationId: workspace })
      .expect(200);
    const invitationId = context.mailer.lastLinkPath("viewer@example.com").split("/").pop();
    await viewer
      .post("/api/auth/organization/accept-invitation")
      .send({ invitationId })
      .expect(200);
    project = ProjectDetailSchema.parse(
      (
        await owner
          .post(`/api/v1/workspaces/${workspace}/projects`)
          .send({ name: "Site", domain: "site.test", locationCode: 2792, languageCode: "tr" })
          .expect(201)
      ).body,
    );
  }, 120_000);

  afterAll(async () => {
    await context?.close();
    await fetcher?.close();
    await new Promise((resolve) => server?.close(resolve));
  });

  it("starts an audit as a background task, one at a time", async () => {
    await viewer.post(api("/runs")).send({}).expect(403);
    const run = AuditRunSchema.parse(
      (await owner.post(api("/runs")).send({ maxPages: 50 }).expect(201)).body,
    );
    expect(run).toMatchObject({
      status: "QUEUED",
      maxPages: 50,
      maxDepth: 10,
      startUrl: "https://site.test/",
    });
    expect(run.taskId).not.toBeNull();
    await owner.post(api("/runs")).send({}).expect(409);

    await runQueuedAudit(run.id);
    const overview = SiteAuditOverviewSchema.parse((await viewer.get(api("")).expect(200)).body);
    expect(overview.active).toBeNull();
    expect(overview.latest).toMatchObject({
      id: run.id,
      status: "COMPLETED",
      pagesCrawled: 5,
      previous: null,
      stats: {
        crawled: 5,
        status: { "2xx": 3, "3xx": 1, "4xx": 1 },
        stoppedBy: "complete",
        llmsTxt: { found: true },
        robots: { found: true },
      },
    });
    const codes = overview.latest?.issues.map((issue) => [issue.code, issue.count, issue.new]);
    expect(codes).toEqual(
      expect.arrayContaining([
        ["page_4xx", 1, null],
        ["broken_internal_links", 1, null],
        ["links_to_redirects", 1, null],
        ["sitemap_missing", 1, null],
      ]),
    );
    // One page with errors (/ links to the 404) and the 404 itself: 1 − 2/5.
    expect(overview.latest?.healthScore).toBe(60);
  });

  it("lists pages and the pages behind an issue", async () => {
    const overview = SiteAuditOverviewSchema.parse((await viewer.get(api("")).expect(200)).body);
    const runId = overview.latest?.id as string;
    const all = AuditPageListSchema.parse(
      (await viewer.get(api(`/runs/${runId}/pages`)).expect(200)).body,
    );
    expect(all.total).toBe(5);
    const home = all.data.find((row) => row.url === "https://site.test/");
    expect(home).toMatchObject({
      statusCode: 200,
      indexable: true,
      inlinks: 1,
      issues: { errors: 1 },
    });

    const broken = AuditPageListSchema.parse(
      (await viewer.get(api(`/runs/${runId}/pages?filter=broken`)).expect(200)).body,
    );
    expect(broken.data.map((row) => row.url)).toEqual(["https://site.test/kirik"]);
    const search = AuditPageListSchema.parse(
      (await viewer.get(api(`/runs/${runId}/pages?search=ESKI`)).expect(200)).body,
    );
    expect(search.data.map((row) => [row.url, row.redirectTarget])).toEqual([
      ["https://site.test/eski", "https://site.test/a"],
    ]);

    const occurrences = await viewer
      .get(api(`/runs/${runId}/issues/broken_internal_links`))
      .expect(200);
    expect(occurrences.body).toEqual({
      total: 1,
      data: [
        {
          pageId: home?.id,
          url: "https://site.test/",
          data: { count: 1, urls: ["https://site.test/kirik"] },
        },
      ],
    });
    await viewer.get(api(`/runs/${runId}/issues/DROP TABLE`)).expect(400);
  });

  it("compares a run with the previous one", async () => {
    site["/"] = page("Ana sayfa başlığı burada", '<a href="/a">A</a><a href="/b">B</a>');
    site["/b"] = page("İkinci sayfa başlığı", '<a href="/a">A</a><img src="x.png">');
    const run = AuditRunSchema.parse((await owner.post(api("/runs")).send({}).expect(201)).body);
    await runQueuedAudit(run.id);

    const overview = SiteAuditOverviewSchema.parse((await viewer.get(api("")).expect(200)).body);
    expect(overview.latest?.id).toBe(run.id);
    expect(overview.latest?.previous?.healthScore).toBe(60);
    expect(overview.latest?.healthScore).toBe(83);
    const byCode = new Map(overview.latest?.issues.map((issue) => [issue.code, issue]));
    expect(byCode.get("broken_internal_links")).toMatchObject({ count: 0, new: 0, fixed: 1 });
    expect(byCode.get("images_missing_alt")).toMatchObject({ count: 1, new: 1, fixed: 0 });
    expect(overview.runs.map((entry) => entry.status)).toEqual(["COMPLETED", "COMPLETED"]);
    resetSite();
  });

  it("cancels an audit before it runs", async () => {
    const run = AuditRunSchema.parse((await owner.post(api("/runs")).send({}).expect(201)).body);
    await viewer.post(api(`/runs/${run.id}/cancel`)).expect(403);
    const canceled = await owner.post(api(`/runs/${run.id}/cancel`)).expect(200);
    expect(canceled.body.status).toBe("CANCELED");
    await owner.post(api(`/runs/${run.id}/cancel`)).expect(409);
    await runQueuedAudit(run.id);
    const detail = await viewer.get(api(`/runs/${run.id}`)).expect(200);
    expect(detail.body).toMatchObject({ status: "CANCELED", pagesCrawled: 0 });
  });
});
