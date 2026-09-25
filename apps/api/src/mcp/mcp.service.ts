import { HttpException, Inject, Injectable, Logger } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  AuditPageFilterSchema,
  DomainOverviewRequestSchema,
  KeywordResearchSchema,
  ResearchModeSchema,
  WorkspaceRoleSchema,
  hasWorkspaceRole,
  type ApiScope,
  type WorkspaceRole,
} from "@seo-geo/contracts";
import type { Project } from "@seo-geo/db";
import { z } from "zod";

import { AiReadModelService } from "../ai-visibility/ai-read-model.service.js";
import { PromptsService } from "../ai-visibility/prompts.service.js";
import type { Principal } from "../auth/principal.js";
import { BacklinksService } from "../backlinks/backlinks.service.js";
import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { PrismaService } from "../database/prisma.service.js";
import { DomainOverviewService } from "../domains/domain-overview.service.js";
import { KeywordResearchService } from "../keywords/keyword-research.service.js";
import { RankTrackerService } from "../rank-tracker/rank-tracker.service.js";
import { SiteAuditService } from "../site-audit/site-audit.service.js";

/** A tool failure the caller can act on; shown to the model as the tool's result. */
class ToolError extends Error {}

const ProjectId = z.uuid().describe("A project ID from list_projects.");
const Days = z
  .union([z.literal(7), z.literal(30), z.literal(90)])
  .default(30)
  .describe("Reporting window in days: 7, 30 or 90.");
const ConfirmCost = z
  .number()
  .min(0)
  .optional()
  .describe(
    "Set to the estimated cost in USD from a previous call to confirm a paid request. Without it the tool only returns the estimate.",
  );
const Refresh = z
  .boolean()
  .default(false)
  .describe("Load the data again although it is cached (paid). Cached data is at most 7 days old.");

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
/** Top keywords a domain overview returns to agents (the web app shows all). */
const MCP_DOMAIN_KEYWORDS = 50;

const INSTRUCTIONS = `SEO-GEO: rankings, keyword research, site audits, backlinks and visibility in AI answers (ChatGPT, Gemini, Perplexity, Claude, Google AI Mode and AI Overviews) for the projects of a workspace.
Start with list_projects. Rates come with 95% intervals; "lowSample" means fewer than 20 answers, so read changes with care.
Paid tools (get_keyword_ideas, get_domain_overview, get_backlinks and get_link_gap when not cached, add_ai_prompts) first return an estimate; call them again with confirm_cost_usd to proceed.`;

function total<T>(rows: readonly T[], value: (row: T) => number): number {
  return rows.reduce((sum, row) => sum + value(row), 0);
}

function text(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function failure(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function truncate(value: string | null, max: number): string | null {
  if (value === null || value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

/**
 * The MCP server (docs/backend.md, "Public API and MCP"): tools over the same services as the
 * REST API, with the same workspace membership, roles and API key scopes. A server is created
 * per request for its principal (stateless Streamable HTTP).
 */
@Injectable()
export class McpService {
  private readonly logger = new Logger("Mcp");

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
    private readonly rankTracker: RankTrackerService,
    private readonly aiReports: AiReadModelService,
    private readonly prompts: PromptsService,
    private readonly siteAudit: SiteAuditService,
    private readonly research: KeywordResearchService,
    private readonly domains: DomainOverviewService,
    private readonly backlinks: BacklinksService,
  ) {}

  createServer(principal: Principal): McpServer {
    const server = new McpServer(
      { name: "seo-geo", version: this.config.version },
      { instructions: INSTRUCTIONS },
    );
    const access = new Access(this.prisma, principal);
    const run = async (work: () => Promise<unknown>): Promise<CallToolResult> => {
      try {
        return text(await work());
      } catch (error) {
        if (error instanceof ToolError) return failure(error.message);
        if (error instanceof HttpException && error.getStatus() < 500) {
          return failure(error.message);
        }
        this.logger.error(error);
        return failure("The tool failed. Try again later.");
      }
    };

    server.registerTool(
      "list_projects",
      {
        title: "List projects",
        description: "Workspaces this key can use, with their projects (domain and market).",
        annotations: READ_ONLY,
      },
      () =>
        run(async () => {
          access.requireScope("read");
          return this.listProjects(principal);
        }),
    );

    server.registerTool(
      "get_rankings",
      {
        title: "Get rankings",
        description:
          "Google positions of the project's tracked keywords: summary (visibility, top 3/10, AI Overviews, share of voice against competitors) and keywords with changes and metrics.",
        inputSchema: {
          project_id: ProjectId,
          days: Days,
          limit: z.int().min(1).max(500).default(100).describe("Keywords to return."),
        },
        annotations: READ_ONLY,
      },
      ({ project_id, days, limit }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          const data = await this.rankTracker.data(project.workspaceId, project.id, days);
          const { history: _history, ...summary } = data.summary;
          return {
            summary,
            keywords: data.keywords.slice(0, limit).map((keyword) => ({
              keyword: keyword.keyword,
              position: keyword.latest?.position ?? null,
              url: keyword.latest?.url ?? null,
              checkedOn: keyword.latest?.checkedOn ?? null,
              changes: keyword.changes,
              searchVolume: keyword.metrics?.searchVolume ?? null,
              keywordDifficulty: keyword.metrics?.keywordDifficulty ?? null,
              intent: keyword.metrics?.intent ?? null,
              serpFeatures: keyword.latest?.serpFeatures ?? [],
              aiOverviewPresent: keyword.latest?.aiOverviewPresent ?? null,
              aiOverviewCited: keyword.latest?.aiOverviewCited ?? null,
              tags: keyword.tags,
            })),
            truncated: data.keywords.length > limit,
          };
        }),
    );

    server.registerTool(
      "get_ai_visibility",
      {
        title: "Get AI visibility",
        description:
          "How often AI answers mention and cite the project's brand and its competitors: AI visibility score, mention and citation rates with 95% intervals, share of voice and average rank, overall (with the previous period), per platform and by week, and the most cited domains.",
        inputSchema: { project_id: ProjectId, days: Days },
        annotations: READ_ONLY,
      },
      ({ project_id, days }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          return this.aiReports.summary(project.workspaceId, project.id, days);
        }),
    );

    server.registerTool(
      "list_ai_prompts",
      {
        title: "List AI prompts",
        description:
          "The questions the project asks AI platforms, with the own brand's mention and citation rates and the latest answer of each platform.",
        inputSchema: {
          project_id: ProjectId,
          days: Days,
          search: z.string().trim().max(200).optional().describe("Text the prompt contains."),
          limit: z.int().min(1).max(200).default(50),
        },
        annotations: READ_ONLY,
      },
      ({ project_id, days, search, limit }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          return this.aiReports.prompts(project.workspaceId, project.id, {
            days,
            search,
            limit,
            offset: 0,
          });
        }),
    );

    server.registerTool(
      "get_ai_answers",
      {
        title: "Get AI answers",
        description:
          "Recent answers of the AI platforms to one prompt: the answer text, which tracked brands it mentions (rank, sentiment) and the sources it cites.",
        inputSchema: {
          project_id: ProjectId,
          prompt_id: z.uuid().describe("A prompt ID from list_ai_prompts."),
          days: Days,
          limit: z.int().min(1).max(30).default(6).describe("Answers to return, newest first."),
          max_chars: z
            .int()
            .min(200)
            .max(20_000)
            .default(3000)
            .describe("Longest answer text returned."),
        },
        annotations: READ_ONLY,
      },
      ({ project_id, prompt_id, days, limit, max_chars }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          const detail = await this.aiReports.detail(
            project.workspaceId,
            project.id,
            prompt_id,
            days,
          );
          const names = new Map(detail.brands.map((brand) => [brand.entityId, brand.name]));
          return {
            prompt: detail.prompt,
            brands: detail.brands,
            answers: detail.answers.slice(0, limit).map((answer) => ({
              platform: answer.platform,
              model: answer.model,
              runOn: answer.runOn,
              status: answer.status,
              error: answer.error,
              answer: truncate(answer.answer, max_chars),
              mentions: answer.mentions.map((mention) => ({
                brand: names.get(mention.entityId) ?? mention.entityId,
                firstRank: mention.firstRank,
                mentionCount: mention.mentionCount,
                sentiment: mention.sentiment,
              })),
              citations: answer.citations.map((citation) => ({
                rank: citation.rank,
                url: citation.url,
                domain: citation.domain,
                brand: citation.entityId ? (names.get(citation.entityId) ?? null) : null,
              })),
            })),
          };
        }),
    );

    server.registerTool(
      "list_ai_sources",
      {
        title: "List AI sources",
        description:
          "Domains AI answers cite for the project's prompts (share of all citations, prompts, platforms) and the project's own pages they cite.",
        inputSchema: { project_id: ProjectId, days: Days },
        annotations: READ_ONLY,
      },
      ({ project_id, days }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          return this.aiReports.sources(project.workspaceId, project.id, days);
        }),
    );

    server.registerTool(
      "get_site_audit",
      {
        title: "Get site audit",
        description:
          "The latest completed site audit: health score, average page citability score, crawl statistics and issues with changes since the previous audit.",
        inputSchema: { project_id: ProjectId },
        annotations: READ_ONLY,
      },
      ({ project_id }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          const overview = await this.siteAudit.overview(project.workspaceId, project.id);
          return {
            latest: overview.latest && {
              ...overview.latest,
              issues: overview.latest.issues.filter((issue) => issue.count > 0),
            },
            active: overview.active,
          };
        }),
    );

    server.registerTool(
      "list_audit_pages",
      {
        title: "List audited pages",
        description:
          "Pages of the latest completed site audit with status, indexability, issue counts and citability score (how easily AI answers can quote the page).",
        inputSchema: {
          project_id: ProjectId,
          filter: AuditPageFilterSchema.default("all"),
          sort: z
            .enum(["url", "citability"])
            .default("citability")
            .describe("`citability`: lowest score first."),
          limit: z.int().min(1).max(200).default(50),
        },
        annotations: READ_ONLY,
      },
      ({ project_id, filter, sort, limit }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          const runId = await this.latestAuditRun(project.id);
          return this.siteAudit.pages(project.workspaceId, project.id, runId, {
            filter,
            sort,
            limit,
            offset: 0,
          });
        }),
    );

    server.registerTool(
      "get_audit_page",
      {
        title: "Get audited page",
        description:
          "One audited page: its issues, citability factors (answer-first introduction, question headings, structured data, freshness, …) and what to improve first.",
        inputSchema: {
          project_id: ProjectId,
          page_id: z.uuid().describe("A page ID from list_audit_pages."),
        },
        annotations: READ_ONLY,
      },
      ({ project_id, page_id }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          const page = await this.prisma.auditPage.findUnique({
            where: { id: page_id },
            select: { runId: true },
          });
          if (!page) throw new ToolError("Page not found.");
          return this.siteAudit.page(project.workspaceId, project.id, page.runId, page_id);
        }),
    );

    server.registerTool(
      "get_keyword_ideas",
      {
        title: "Get keyword ideas",
        description:
          "Keyword ideas, suggestions (long-tail keywords containing the seed) or related keywords with search volume, difficulty, CPC and intent, in the project's market. Paid unless cached: returns the estimate first.",
        inputSchema: {
          project_id: ProjectId,
          keyword: z.string().trim().min(1).max(80).describe("The seed keyword."),
          mode: ResearchModeSchema.default("ideas"),
          limit: z.int().min(10).max(200).default(50),
          confirm_cost_usd: ConfirmCost,
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      ({ project_id, keyword, mode, limit, confirm_cost_usd }) =>
        run(async () => {
          const project = await access.project(project_id, "member", "read");
          const input = KeywordResearchSchema.parse({
            mode,
            keyword,
            locationCode: project.defaultLocationCode,
            languageCode: project.defaultLanguageCode,
            limit,
          });
          const quote = await this.research.quote(input);
          if (quote.estimatedCostUsd > 0) {
            access.requireScope("run:paid");
            if (!confirmed(confirm_cost_usd, quote.estimatedCostUsd)) {
              return confirmation(quote.estimatedCostUsd);
            }
          }
          const result = await this.research.research(project.workspaceId, input);
          return {
            keyword: result.keyword,
            mode: result.mode,
            locationCode: result.locationCode,
            languageCode: result.languageCode,
            cached: result.cached,
            costUsd: result.costUsd,
            totalCount: result.totalCount,
            keywords: [...(result.seed ? [result.seed] : []), ...result.items].map((item) => ({
              keyword: item.keyword,
              searchVolume: item.searchVolume,
              keywordDifficulty: item.keywordDifficulty,
              cpc: item.cpc,
              intent: item.intent,
              trend: item.trend,
            })),
          };
        }),
    );

    server.registerTool(
      "get_domain_overview",
      {
        title: "Get domain overview",
        description:
          "Organic keywords, estimated traffic and its history, the keywords with the most traffic, competing domains and the backlink summary of any domain, in the project's market. Paid unless cached: returns the estimate first.",
        inputSchema: {
          project_id: ProjectId,
          domain: z
            .string()
            .trim()
            .min(1)
            .max(2048)
            .optional()
            .describe("A domain such as example.com; the project's own domain when omitted."),
          refresh: Refresh,
          confirm_cost_usd: ConfirmCost,
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      ({ project_id, domain, refresh, confirm_cost_usd }) =>
        run(async () => {
          const project = await access.project(project_id, "member", "read");
          const input = DomainOverviewRequestSchema.parse({
            domain: domain ?? project.domain,
            locationCode: project.defaultLocationCode,
            languageCode: project.defaultLanguageCode,
            refresh,
          });
          const quote = await this.domains.quote(input);
          if (quote.estimatedCostUsd > 0) {
            access.requireScope("run:paid");
            if (!confirmed(confirm_cost_usd, quote.estimatedCostUsd)) {
              return confirmation(quote.estimatedCostUsd);
            }
          }
          const overview = await this.domains.overview(project.workspaceId, input);
          return {
            domain: overview.domain,
            locationCode: overview.locationCode,
            languageCode: overview.languageCode,
            costUsd: overview.costUsd,
            organic: overview.organic,
            history: overview.history,
            topKeywords: overview.topKeywords.slice(0, MCP_DOMAIN_KEYWORDS).map((item) => ({
              keyword: item.keyword,
              position: item.position,
              change: item.change,
              isNew: item.isNew,
              searchVolume: item.searchVolume,
              keywordDifficulty: item.keywordDifficulty,
              traffic: item.traffic,
              url: item.url,
            })),
            competitors: overview.competitors,
            backlinks: overview.backlinks,
            dataAsOf: {
              labs: overview.sources.labs.fetchedAt,
              backlinks: overview.sources.backlinks.fetchedAt,
            },
          };
        }),
    );

    server.registerTool(
      "get_backlinks",
      {
        title: "Get backlinks",
        description:
          "The project's backlink profile: domain rank (0–100), backlinks and referring domains, the last 12 months, links gained and lost day by day over 30 days, and the strongest referring domains, backlinks and anchors. Paid unless loaded in the last 7 days: returns the estimate first.",
        inputSchema: {
          project_id: ProjectId,
          limit: z
            .int()
            .min(1)
            .max(100)
            .default(20)
            .describe("Referring domains, backlinks and anchors to return."),
          refresh: Refresh,
          confirm_cost_usd: ConfirmCost,
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      ({ project_id, limit, refresh, confirm_cost_usd }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          const state = await this.backlinks.state(project.workspaceId, project.id);
          let report = refresh ? null : state.report;
          if (!report) {
            await access.project(project_id, "member", "run:paid");
            const estimate = refresh ? state.refreshCostUsd : state.estimatedCostUsd;
            if (!confirmed(confirm_cost_usd, estimate)) return confirmation(estimate);
            report = await this.backlinks.load(project.workspaceId, project.id, { refresh });
          }
          const days = report.newLost;
          return {
            target: report.target,
            includeSubdomains: report.includeSubdomains,
            costUsd: report.costUsd,
            dataAsOf: report.source.fetchedAt,
            profile: report.profile,
            history: report.history,
            newLost: {
              from: days[0]?.date ?? null,
              to: days.at(-1)?.date ?? null,
              newReferringDomains: total(days, (day) => day.newReferringDomains),
              lostReferringDomains: total(days, (day) => day.lostReferringDomains),
              newBacklinks: total(days, (day) => day.newBacklinks),
              lostBacklinks: total(days, (day) => day.lostBacklinks),
              daily: days,
            },
            referringDomains: {
              total: report.referringDomains.total,
              top: report.referringDomains.items.slice(0, limit),
            },
            backlinks: {
              total: report.backlinks.total,
              top: report.backlinks.items.slice(0, limit).map((link) => ({
                from: link.urlFrom,
                to: link.urlTo,
                anchor: link.anchor,
                type: link.type,
                dofollow: link.dofollow,
                domainRank: link.domainRank,
                firstSeen: link.firstSeen,
                isNew: link.isNew,
                isBroken: link.isBroken,
              })),
            },
            anchors: {
              total: report.anchors.total,
              top: report.anchors.items.slice(0, limit),
            },
          };
        }),
    );

    server.registerTool(
      "get_link_gap",
      {
        title: "Get link gap",
        description:
          "Backlink profiles of the project and its competitors (from the project settings), and the link gap: strong domains that link to competitors but not to the project, those linking to the most competitors first. Paid unless loaded in the last 7 days: returns the estimate first.",
        inputSchema: {
          project_id: ProjectId,
          limit: z.int().min(1).max(200).default(50).describe("Link gap domains to return."),
          refresh: Refresh,
          confirm_cost_usd: ConfirmCost,
        },
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      ({ project_id, limit, refresh, confirm_cost_usd }) =>
        run(async () => {
          const project = await access.project(project_id, "viewer", "read");
          const state = await this.backlinks.competitorsState(project.workspaceId, project.id);
          if (state.brands.length < 2) {
            throw new ToolError(
              "The project has no competitors; add them in the project settings.",
            );
          }
          let report = refresh ? null : state.report;
          if (!report) {
            await access.project(project_id, "member", "run:paid");
            const estimate = refresh ? state.refreshCostUsd : state.estimatedCostUsd;
            if (!confirmed(confirm_cost_usd, estimate)) return confirmation(estimate);
            report = await this.backlinks.loadCompetitors(project.workspaceId, project.id, {
              refresh,
            });
          }
          const brands = new Map(report.brands.map((brand) => [brand.brandId, brand]));
          return {
            target: report.target,
            costUsd: report.costUsd,
            dataAsOf: report.source.fetchedAt,
            brands: report.brands.map((brand) => ({
              name: brand.name,
              kind: brand.kind,
              domain: brand.domain,
              profile: brand.profile,
            })),
            linkGap: {
              total: report.linkGap.length,
              top: report.linkGap.slice(0, limit).map((entry) => ({
                domain: entry.domain,
                rank: entry.rank,
                linksTo: entry.links.map((link) => ({
                  competitor: brands.get(link.brandId)?.name ?? null,
                  domain: brands.get(link.brandId)?.domain ?? null,
                  rank: link.rank,
                  backlinks: link.backlinks,
                  firstSeen: link.firstSeen,
                })),
              })),
            },
          };
        }),
    );

    server.registerTool(
      "add_ai_prompts",
      {
        title: "Add AI prompts",
        description:
          "Adds questions for the project to ask AI platforms. They are asked right away and then on the project's schedule, which costs money: returns the estimate for one period first.",
        inputSchema: {
          project_id: ProjectId,
          prompts: z.array(z.string().max(500)).min(1).max(50),
          tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
          confirm_cost_usd: ConfirmCost,
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      ({ project_id, prompts, tags, confirm_cost_usd }) =>
        run(async () => {
          const project = await access.project(project_id, "member", "run:paid");
          const input = { prompts, tags };
          const preview = await this.prompts.preview(project.workspaceId, project.id, input);
          if (preview.prompts.length === 0) {
            return { added: 0, duplicates: preview.duplicates, invalid: preview.invalid };
          }
          if (preview.costUsd > 0 && !confirmed(confirm_cost_usd, preview.costUsd)) {
            return {
              ...confirmation(preview.costUsd),
              newPrompts: preview.prompts.length,
              duplicates: preview.duplicates,
              invalid: preview.invalid,
            };
          }
          return this.prompts.create(project.workspaceId, project.id, input, principal.user.id);
        }),
    );

    server.registerTool(
      "run_site_audit",
      {
        title: "Run site audit",
        description:
          "Starts a crawl of the project's site (free). Check the result later with get_site_audit.",
        inputSchema: {
          project_id: ProjectId,
          max_pages: z.int().min(10).max(5000).default(500),
        },
        annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
      },
      ({ project_id, max_pages }) =>
        run(async () => {
          const project = await access.project(project_id, "member", "write");
          return this.siteAudit.start(
            project.workspaceId,
            project.id,
            { maxPages: max_pages, maxDepth: 10 },
            principal.user.id,
          );
        }),
    );

    return server;
  }

  private async listProjects(principal: Principal) {
    const bound = principal.apiKey?.workspaceId;
    const memberships = await this.prisma.member.findMany({
      where: { userId: principal.user.id, ...(bound ? { organizationId: bound } : {}) },
      orderBy: { createdAt: "asc" },
      select: { role: true, organization: { select: { id: true, name: true } } },
    });
    const projects = await this.prisma.project.findMany({
      where: {
        workspaceId: { in: memberships.map((member) => member.organization.id) },
        archivedAt: null,
      },
      orderBy: { createdAt: "asc" },
    });
    return {
      workspaces: memberships.map(({ role, organization }) => ({
        id: organization.id,
        name: organization.name,
        role,
        projects: projects
          .filter((project) => project.workspaceId === organization.id)
          .map((project) => ({
            id: project.id,
            name: project.name,
            domain: project.domain,
            locationCode: project.defaultLocationCode,
            languageCode: project.defaultLanguageCode,
          })),
      })),
    };
  }

  private async latestAuditRun(projectId: string): Promise<string> {
    const run = await this.prisma.auditRun.findFirst({
      where: { projectId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!run) throw new ToolError("The project has no completed site audit yet.");
    return run.id;
  }
}

/** Workspace membership, role and API key scopes of the principal, checked per tool call. */
class Access {
  constructor(
    private readonly prisma: PrismaService,
    private readonly principal: Principal,
  ) {}

  requireScope(scope: ApiScope): void {
    const scopes = this.principal.apiKey?.scopes;
    if (scopes && !scopes.includes(scope)) {
      throw new ToolError(`This API key does not have the ${scope} scope.`);
    }
  }

  /** The project, when the principal may use it with `role` and `scope`. */
  async project(projectId: string, role: WorkspaceRole, scope: ApiScope): Promise<Project> {
    this.requireScope(scope);
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    const bound = this.principal.apiKey?.workspaceId;
    if (!project || (bound && project.workspaceId !== bound)) {
      throw new ToolError("Project not found.");
    }
    const member = await this.prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: project.workspaceId,
          userId: this.principal.user.id,
        },
      },
      select: { role: true },
    });
    const memberRole = WorkspaceRoleSchema.safeParse(member?.role);
    if (!memberRole.success) throw new ToolError("Project not found.");
    if (!hasWorkspaceRole(memberRole.data, role)) {
      throw new ToolError(`This needs the ${role} role or higher in the workspace.`);
    }
    return project;
  }
}

function confirmed(confirmedUsd: number | undefined, estimateUsd: number): boolean {
  return confirmedUsd !== undefined && confirmedUsd + 1e-9 >= estimateUsd;
}

function confirmation(estimateUsd: number) {
  return {
    confirmationRequired: true,
    estimatedCostUsd: estimateUsd,
    message: `This costs up to $${estimateUsd}. Call the tool again with confirm_cost_usd: ${estimateUsd} to proceed.`,
  };
}
