import {
  CreatedWorkspaceApiKeySchema,
  ProjectDetailSchema,
  type ApiScope,
} from "@seo-geo/contracts";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DATAFORSEO_OPTIONS } from "../src/credentials/dataforseo.gateway.js";
import {
  TEST_SERVER_URL,
  createIntegrationApp,
  signUpVerified,
  type Agent,
  type IntegrationApp,
} from "./support/app.js";
import { GOOD_LOGIN, fakeDataForSeo } from "./support/dataforseo.js";

const PASSWORD = "a long enough password";
const ACCEPT = "application/json, text/event-stream";

interface ToolOutcome {
  isError: boolean;
  data: unknown;
  text: string;
}

describe.skipIf(!TEST_SERVER_URL)("MCP server", () => {
  const dataForSeo = fakeDataForSeo({
    balance: 10,
    metrics: {
      "kahve makinesi": {
        searchVolume: 110000,
        keywordDifficulty: 54,
        cpc: 0.38,
        intent: "commercial",
      },
      "kahve makinesi fiyatları": {
        searchVolume: 12100,
        keywordDifficulty: 31,
        cpc: 0.41,
        intent: "transactional",
      },
    },
    domains: {
      "example.com": {
        positions: [4, 11, 30, 60],
        traffic: 2410.5,
        keywords: [["kahve makinesi", 4, 1820, 6]],
        competitors: [["rakip.example", 48, 12.5]],
        backlinks: { rank: 31, backlinks: 5120, referringDomains: 240 },
        referringDomains: [["kaynak.example.org", 48, 20]],
      },
    },
  });
  let context: IntegrationApp;
  let owner: Agent;
  let workspace: string;
  let projectId: string;
  let otherProjectId: string;
  let readKey: string;
  let paidKey: string;
  let requestId = 0;

  const api = (path: string, workspaceId = workspace) => `/api/v1/workspaces/${workspaceId}${path}`;

  function rpc(key: string | null, method: string, params?: object) {
    const call = request(context.app.getHttpServer())
      .post("/api/v1/mcp")
      .set("accept", ACCEPT)
      .set("content-type", "application/json");
    if (key) call.set("authorization", `Bearer ${key}`);
    return call.send({ jsonrpc: "2.0", id: ++requestId, method, params });
  }

  async function callTool(key: string, name: string, args: object = {}): Promise<ToolOutcome> {
    const response = await rpc(key, "tools/call", { name, arguments: args }).expect(200);
    const result = response.body.result as { isError?: boolean; content: { text: string }[] };
    const text = result.content[0]?.text ?? "";
    let data: unknown = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { isError: result.isError ?? false, data, text };
  }

  async function createKey(scopes: ApiScope[], workspaceId = workspace): Promise<string> {
    const response = await owner
      .post(api("/api-keys", workspaceId))
      .send({ name: scopes.join("+"), scopes, expiresInDays: 30 })
      .expect(201);
    return CreatedWorkspaceApiKeySchema.parse(response.body).key;
  }

  beforeAll(async () => {
    context = await createIntegrationApp({
      env: { DEPLOYMENT_MODE: "cloud", SMTP_HOST: "smtp.invalid" },
      overrides: [
        {
          provide: DATAFORSEO_OPTIONS,
          useValue: { fetch: dataForSeo.fetch, sleep: async () => {} },
        },
      ],
    });
    owner = await signUpVerified(context, {
      name: "Owner",
      email: "owner@example.com",
      password: PASSWORD,
    });
    const create = async (name: string, slug: string) =>
      (await owner.post("/api/auth/organization/create").send({ name, slug }).expect(200)).body
        .id as string;
    const other = await create("Other", "other");
    workspace = await create("Agency", "agency");
    await owner.put(api("/credentials/dataforseo")).send(GOOD_LOGIN).expect(200);

    const project = async (workspaceId: string, name: string, domain: string) =>
      ProjectDetailSchema.parse(
        (
          await owner
            .post(api("/projects", workspaceId))
            .send({ name, domain, locationCode: 2792, languageCode: "tr" })
            .expect(201)
        ).body,
      ).id;
    projectId = await project(workspace, "Example", "example.com");
    otherProjectId = await project(other, "Elsewhere", "elsewhere.example");
    readKey = await createKey(["read"]);
    paidKey = await createKey(["read", "write", "run:paid"]);
  }, 120_000);

  afterAll(async () => {
    await context?.close();
  });

  it("speaks MCP over HTTP to API keys only", async () => {
    const initialized = await rpc(readKey, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0.0" },
    }).expect(200);
    expect(initialized.body.result).toMatchObject({
      serverInfo: { name: "seo-geo" },
      capabilities: { tools: {} },
    });
    expect(initialized.body.result.instructions).toContain("list_projects");

    const tools = await rpc(readKey, "tools/list").expect(200);
    expect(tools.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "list_projects",
      "get_rankings",
      "get_ai_visibility",
      "list_ai_prompts",
      "get_ai_answers",
      "list_ai_sources",
      "get_site_audit",
      "list_audit_pages",
      "get_audit_page",
      "get_keyword_ideas",
      "get_domain_overview",
      "get_backlinks",
      "get_link_gap",
      "add_ai_prompts",
      "run_site_audit",
    ]);

    // Sessions (cookies) and anonymous callers are refused; there is no event stream.
    await owner.post("/api/v1/mcp").set("accept", ACCEPT).send({}).expect(401);
    await rpc(null, "tools/list").expect(401);
    await request(context.app.getHttpServer())
      .get("/api/v1/mcp")
      .set("authorization", `Bearer ${readKey}`)
      .expect(405);
  });

  it("reads projects, rankings and AI visibility of the key's workspace", async () => {
    const projects = await callTool(readKey, "list_projects");
    expect(projects.data).toEqual({
      workspaces: [
        {
          id: workspace,
          name: "Agency",
          role: "owner",
          projects: [
            {
              id: projectId,
              name: "Example",
              domain: "example.com",
              locationCode: 2792,
              languageCode: "tr",
            },
          ],
        },
      ],
    });

    const rankings = await callTool(readKey, "get_rankings", { project_id: projectId });
    expect(rankings).toMatchObject({
      isError: false,
      data: { summary: { tracked: 0 }, keywords: [], truncated: false },
    });
    const visibility = await callTool(readKey, "get_ai_visibility", {
      project_id: projectId,
      days: 7,
    });
    expect(visibility.data).toMatchObject({
      providerReady: true,
      prompts: { total: 0 },
      brands: [{ name: "Example", kind: "OWN" }],
    });

    // Projects of other workspaces do not exist for this key.
    const elsewhere = await callTool(readKey, "get_rankings", { project_id: otherProjectId });
    expect(elsewhere).toMatchObject({ isError: true, text: "Project not found." });
    const invalid = await rpc(readKey, "tools/call", {
      name: "get_rankings",
      arguments: { project_id: projectId, days: 14 },
    }).expect(200);
    expect(invalid.body.result.isError).toBe(true);

    const audit = await callTool(readKey, "list_audit_pages", { project_id: projectId });
    expect(audit).toMatchObject({
      isError: true,
      text: "The project has no completed site audit yet.",
    });
  });

  it("asks for the run:paid scope and a confirmed estimate before paid work", async () => {
    const args = { project_id: projectId, keyword: "kahve makinesi", mode: "suggestions" };
    const refused = await callTool(readKey, "get_keyword_ideas", args);
    expect(refused).toMatchObject({
      isError: true,
      text: "This API key does not have the run:paid scope.",
    });

    const estimate = await callTool(paidKey, "get_keyword_ideas", args);
    expect(estimate.data).toMatchObject({ confirmationRequired: true, estimatedCostUsd: 0.018 });
    expect(dataForSeo.calls.some((url) => url.includes("keyword_suggestions"))).toBe(false);

    const low = await callTool(paidKey, "get_keyword_ideas", { ...args, confirm_cost_usd: 0.01 });
    expect(low.data).toMatchObject({ confirmationRequired: true });

    const ideas = await callTool(paidKey, "get_keyword_ideas", {
      ...args,
      confirm_cost_usd: 0.018,
    });
    expect(ideas).toMatchObject({
      isError: false,
      data: {
        keyword: "kahve makinesi",
        cached: false,
        keywords: [
          { keyword: "kahve makinesi", searchVolume: 110000 },
          { keyword: "kahve makinesi fiyatları", searchVolume: 12100 },
        ],
      },
    });

    // The same request again is cached: free, no confirmation, even for a read key.
    const cached = await callTool(readKey, "get_keyword_ideas", args);
    expect(cached.data).toMatchObject({ cached: true, costUsd: 0 });
  });

  it("gives a domain overview of the project's domain after a confirmed estimate", async () => {
    const args = { project_id: projectId };
    const refused = await callTool(readKey, "get_domain_overview", args);
    expect(refused.text).toBe("This API key does not have the run:paid scope.");

    const estimate = await callTool(paidKey, "get_domain_overview", args);
    expect(estimate.data).toMatchObject({ confirmationRequired: true });
    const { estimatedCostUsd } = estimate.data as { estimatedCostUsd: number };
    expect(dataForSeo.calls.some((url) => url.includes("domain_rank_overview"))).toBe(false);

    const overview = await callTool(paidKey, "get_domain_overview", {
      ...args,
      confirm_cost_usd: estimatedCostUsd,
    });
    expect(overview).toMatchObject({
      isError: false,
      data: {
        domain: "example.com",
        locationCode: 2792,
        organic: { keywords: 105, traffic: 2410.5 },
        topKeywords: [{ keyword: "kahve makinesi", position: 4, change: 2 }],
        competitors: [{ domain: "rakip.example", commonKeywords: 48 }],
        backlinks: { rank: 31, referringDomains: 240 },
      },
    });

    // Cached now: free for a read key; anything but a domain is refused.
    const cached = await callTool(readKey, "get_domain_overview", {
      ...args,
      domain: "https://www.example.com/",
    });
    expect(cached.data).toMatchObject({ domain: "example.com", costUsd: 0 });
    const invalid = await callTool(paidKey, "get_domain_overview", { ...args, domain: "a b" });
    expect(invalid).toMatchObject({ isError: true, text: "Enter a domain such as example.com." });

    // A refresh is paid again, whatever the cache holds.
    const refresh = await callTool(paidKey, "get_domain_overview", { ...args, refresh: true });
    expect(refresh.data).toMatchObject({ confirmationRequired: true, estimatedCostUsd });
  });

  it("gives the project's backlinks after a confirmed estimate, then for free", async () => {
    const args = { project_id: projectId, limit: 5 };
    const refused = await callTool(readKey, "get_backlinks", args);
    expect(refused.text).toBe("This API key does not have the run:paid scope.");

    const estimate = await callTool(paidKey, "get_backlinks", args);
    expect(estimate.data).toMatchObject({ confirmationRequired: true });
    const { estimatedCostUsd } = estimate.data as { estimatedCostUsd: number };
    expect(dataForSeo.calls.some((url) => url.includes("referring_domains"))).toBe(false);

    const loaded = await callTool(paidKey, "get_backlinks", {
      ...args,
      confirm_cost_usd: estimatedCostUsd,
    });
    expect(loaded).toMatchObject({
      isError: false,
      data: {
        target: "example.com",
        profile: { rank: 31, referringDomains: 240 },
        referringDomains: { total: 240, top: [{ domain: "kaynak.example.org", rank: 48 }] },
        backlinks: { top: [{ from: "https://kaynak.example.org/yazi", dofollow: true }] },
        newLost: { newReferringDomains: 60, lostReferringDomains: 30 },
      },
    });
    expect((loaded.data as { costUsd: number }).costUsd).toBeGreaterThan(0);

    // Cached now: free for a read key.
    const cached = await callTool(readKey, "get_backlinks", args);
    expect(cached.data).toMatchObject({ target: "example.com", costUsd: 0 });

    // The link gap needs competitors.
    const gap = await callTool(paidKey, "get_link_gap", { project_id: projectId });
    expect(gap).toMatchObject({
      isError: true,
      text: "The project has no competitors; add them in the project settings.",
    });
  });

  it("adds prompts after confirmation and starts audits with the write scope", async () => {
    const args = { project_id: projectId, prompts: ["En iyi kahve makinesi hangisi?"] };
    const estimate = await callTool(paidKey, "add_ai_prompts", args);
    expect(estimate.data).toMatchObject({
      confirmationRequired: true,
      newPrompts: 1,
      duplicates: 0,
    });
    const { estimatedCostUsd } = estimate.data as { estimatedCostUsd: number };
    expect(estimatedCostUsd).toBeGreaterThan(0);
    const added = await callTool(paidKey, "add_ai_prompts", {
      ...args,
      confirm_cost_usd: estimatedCostUsd,
    });
    expect(added.data).toEqual({ added: 1, duplicates: 0, invalid: 0 });
    const again = await callTool(paidKey, "add_ai_prompts", args);
    expect(again.data).toEqual({ added: 0, duplicates: 1, invalid: 0 });

    const prompts = await callTool(readKey, "list_ai_prompts", { project_id: projectId });
    expect(prompts.data).toMatchObject({
      total: 1,
      data: [{ text: "En iyi kahve makinesi hangisi?" }],
    });

    const refused = await callTool(readKey, "run_site_audit", { project_id: projectId });
    expect(refused.text).toBe("This API key does not have the write scope.");
    const started = await callTool(paidKey, "run_site_audit", {
      project_id: projectId,
      max_pages: 20,
    });
    expect(started.data).toMatchObject({ status: "QUEUED", maxPages: 20 });
  });
});
