import { HttpStatus, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  AUDIT_RUNS_KEPT,
  AuditStatsSchema,
  ErrorCode,
  type AuditIssueOccurrence,
  type AuditIssueSummary,
  type AuditPageList,
  type AuditPagesQuery,
  type AuditRun,
  type AuditRunDetail,
  type SiteAuditOverview,
  type StartAudit,
} from "@seo-geo/contracts";
import { hostMatchesDomain } from "@seo-geo/core";
import {
  HEALTH_SCORE_VERSION,
  ISSUE_CATALOG,
  analyzeCrawl,
  crawlSite,
  diffIssues,
  isIndexable,
  isIssueCode,
  issueSeverity,
  type AuditAnalysis,
  type CrawlResult,
} from "@seo-geo/core/audit";
import { SafeFetchError } from "@seo-geo/core/net";
import { Prisma, type AuditRun as AuditRunRow, type Project } from "@seo-geo/db";
import { z } from "zod";

import { ProblemException } from "../common/problem.exception.js";
import { iso } from "../common/serialize.js";
import { PrismaService } from "../database/prisma.service.js";
import { SafeFetcherService } from "../net/safe-fetcher.service.js";
import type { TaskContext, TaskOutcome } from "../tasks/task-registry.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { TaskService } from "../tasks/task.service.js";

export const AUDIT_TASK = "audit.crawl";

const RunConfigSchema = z.object({
  startUrl: z.string(),
  maxPages: z.int(),
  maxDepth: z.int(),
});
const TaskInputSchema = z.object({ runId: z.uuid() });

/** Rows per insert statement when a run is stored. */
const INSERT_CHUNK = 1000;
const ACTIVE_STATUSES = ["QUEUED", "RUNNING"] as const;

export function toAuditRun(row: AuditRunRow): AuditRun {
  const config = RunConfigSchema.parse(row.config);
  const stats = AuditStatsSchema.safeParse(row.stats);
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger,
    startUrl: config.startUrl,
    maxPages: config.maxPages,
    maxDepth: config.maxDepth,
    pagesCrawled: row.pagesCrawled,
    healthScore: row.healthScore,
    scoreVersion: row.scoreVersion,
    stats: stats.success ? stats.data : null,
    error: row.error,
    taskId: row.taskId,
    createdAt: row.createdAt.toISOString(),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
  };
}

function chunks<T>(items: readonly T[], size = INSERT_CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

const trim = (value: string | null | undefined, length: number) =>
  value ? value.slice(0, length) : null;

/** Site audits: crawl runs, their pages, links and issues. */
@Injectable()
export class SiteAuditService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TaskService,
    private readonly registry: TaskRegistry,
    private readonly fetcher: SafeFetcherService,
  ) {}

  onModuleInit(): void {
    this.registry.registerTask(AUDIT_TASK, {
      handler: (context) => this.execute(context),
      queue: { retryLimit: 0, expireInSeconds: 3 * 60 * 60 },
    });
  }

  async overview(workspaceId: string, projectId: string): Promise<SiteAuditOverview> {
    await this.project(workspaceId, projectId);
    const runs = await this.prisma.auditRun.findMany({
      where: { workspaceId, projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const active = runs.find((run) => (ACTIVE_STATUSES as readonly string[]).includes(run.status));
    const latest = runs.find((run) => run.status === "COMPLETED");
    return {
      latest: latest ? await this.detailOf(latest) : null,
      active: active ? toAuditRun(active) : null,
      runs: runs.map(toAuditRun),
    };
  }

  async start(
    workspaceId: string,
    projectId: string,
    input: StartAudit,
    userId: string,
  ): Promise<AuditRun> {
    const project = await this.project(workspaceId, projectId);
    const active = await this.prisma.auditRun.findFirst({
      where: { projectId, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (active) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: "An audit of this project is already running.",
      });
    }
    const run = await this.prisma.auditRun.create({
      data: {
        workspaceId,
        projectId,
        createdBy: userId,
        config: {
          startUrl: `https://${project.domain}/`,
          maxPages: input.maxPages,
          maxDepth: input.maxDepth,
        },
      },
    });
    const { task } = await this.tasks.create({
      workspaceId,
      projectId,
      type: AUDIT_TASK,
      input: { runId: run.id },
      createdBy: userId,
      estimatedCostUsd: 0,
    });
    return toAuditRun(
      await this.prisma.auditRun.update({ where: { id: run.id }, data: { taskId: task.id } }),
    );
  }

  /** Stops a queued or running audit; pages crawled so far are discarded. */
  async cancel(workspaceId: string, projectId: string, runId: string): Promise<AuditRun> {
    const run = await this.run(workspaceId, projectId, runId);
    if (!(ACTIVE_STATUSES as readonly string[]).includes(run.status)) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: `A ${run.status.toLowerCase()} audit cannot be canceled.`,
      });
    }
    const updated = await this.prisma.auditRun.update({
      where: { id: run.id },
      data: { status: "CANCELED", finishedAt: new Date() },
    });
    if (run.taskId) {
      await this.prisma.task.updateMany({
        where: { id: run.taskId, status: "queued" },
        data: { status: "canceled", finishedAt: new Date() },
      });
    }
    return toAuditRun(updated);
  }

  async detail(workspaceId: string, projectId: string, runId: string): Promise<AuditRunDetail> {
    return this.detailOf(await this.run(workspaceId, projectId, runId));
  }

  async occurrences(
    workspaceId: string,
    projectId: string,
    runId: string,
    code: string,
    page: { limit: number; offset: number },
  ): Promise<{ data: AuditIssueOccurrence[]; total: number }> {
    const run = await this.run(workspaceId, projectId, runId);
    const where = { runId: run.id, code };
    const [rows, total] = await Promise.all([
      this.prisma.auditIssue.findMany({
        where,
        include: { page: { select: { url: true } } },
        orderBy: { id: "asc" },
        take: page.limit,
        skip: page.offset,
      }),
      this.prisma.auditIssue.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        pageId: row.pageId,
        url: row.page?.url ?? null,
        data: (row.data ?? {}) as Record<string, unknown>,
      })),
      total,
    };
  }

  async pages(
    workspaceId: string,
    projectId: string,
    runId: string,
    query: AuditPagesQuery,
  ): Promise<AuditPageList> {
    const run = await this.run(workspaceId, projectId, runId);
    const filters: Record<AuditPagesQuery["filter"], Prisma.AuditPageWhereInput> = {
      all: {},
      errors: { issues: { some: { severity: "ERROR" } } },
      warnings: { issues: { some: { severity: "WARNING" } } },
      broken: {
        OR: [
          { statusCode: { gte: 400 } },
          { fetchError: { not: null }, NOT: { fetchError: "blocked_by_robots" } },
        ],
      },
      redirects: { statusCode: { gte: 300, lt: 400 } },
      noindex: { robotsMeta: { contains: "noindex" } },
    };
    const where: Prisma.AuditPageWhereInput = {
      runId: run.id,
      ...filters[query.filter],
      ...(query.search ? { url: { contains: query.search, mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditPage.findMany({
        where,
        orderBy: [{ url: "asc" }],
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.auditPage.count({ where }),
    ]);
    const counts = await this.prisma.auditIssue.groupBy({
      by: ["pageId", "severity"],
      where: { runId: run.id, pageId: { in: rows.map((row) => row.id) } },
      _count: { _all: true },
    });
    const byPage = new Map<string, { errors: number; warnings: number; notices: number }>();
    for (const count of counts) {
      if (!count.pageId) continue;
      const entry = byPage.get(count.pageId) ?? { errors: 0, warnings: 0, notices: 0 };
      if (count.severity === "ERROR") entry.errors += count._count._all;
      else if (count.severity === "WARNING") entry.warnings += count._count._all;
      else entry.notices += count._count._all;
      byPage.set(count.pageId, entry);
    }
    return {
      total,
      data: rows.map((row) => ({
        id: row.id,
        url: row.url,
        depth: row.depth,
        statusCode: row.statusCode,
        fetchError: row.fetchError,
        contentType: row.contentType,
        redirectTarget: row.redirectTarget,
        title: row.title,
        indexable: row.indexable,
        wordCount: row.wordCount,
        loadMs: row.loadMs,
        inlinks: row.inlinks,
        schemaTypes: row.schemaTypes,
        issues: byPage.get(row.id) ?? { errors: 0, warnings: 0, notices: 0 },
      })),
    };
  }

  // ── Worker ──────────────────────────────────────────────────────────────────────

  /** The `audit.crawl` task: crawls the site, applies the rules and stores the run. */
  async execute(context: TaskContext): Promise<TaskOutcome> {
    const { runId } = TaskInputSchema.parse(context.input);
    const run = await this.prisma.auditRun.findUnique({
      where: { id: runId },
      include: { project: true },
    });
    if (!run || run.status !== "QUEUED") return { result: { runId, skipped: true } };
    const config = RunConfigSchema.parse(run.config);

    await this.prisma.auditRun.update({
      where: { id: run.id },
      data: { status: "RUNNING", startedAt: new Date() },
    });
    const controller = new AbortController();
    const abort = () => controller.abort();
    context.signal.addEventListener("abort", abort, { once: true });

    try {
      const startUrl = await this.resolveStartUrl(run.project, controller.signal);
      const crawl = await crawlSite({
        startUrl,
        isInternal: (url) =>
          hostMatchesDomain(url, run.project.domain, {
            includeSubdomains: run.project.includeSubdomains,
          }),
        maxPages: config.maxPages,
        maxDepth: config.maxDepth,
        fetch: (url, options) => this.fetcher.fetch(url, options),
        signal: controller.signal,
        onProgress: async (crawled) => {
          if (crawled % 10 !== 0) return;
          await context.progress(Math.min(95, (crawled / config.maxPages) * 95));
          const current = await this.prisma.auditRun.update({
            where: { id: run.id },
            data: { pagesCrawled: crawled },
            select: { status: true },
          });
          if (current.status === "CANCELED") controller.abort();
        },
      });
      const status = await this.prisma.auditRun.findUnique({
        where: { id: run.id },
        select: { status: true },
      });
      if (status?.status === "CANCELED") return { result: { runId, canceled: true } };
      if (crawl.stoppedBy === "aborted") throw new Error("The audit was interrupted.");

      const analysis = analyzeCrawl(crawl);
      await this.store(run, { ...config, startUrl }, crawl, analysis);
      await this.prune(run.projectId);
      return {
        result: { runId, healthScore: analysis.healthScore, pages: crawl.pages.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.auditRun.updateMany({
        where: { id: run.id, status: "RUNNING" },
        data: { status: "FAILED", error: message.slice(0, 500), finishedAt: new Date() },
      });
      throw error;
    } finally {
      context.signal.removeEventListener("abort", abort);
    }
  }

  /** HTTPS unless the site only answers over HTTP. */
  private async resolveStartUrl(project: Project, signal: AbortSignal): Promise<string> {
    const https = `https://${project.domain}/`;
    try {
      await this.fetcher.fetch(https, { readBodyIf: () => false, timeoutMs: 15_000, signal });
      return https;
    } catch (error) {
      if (!(error instanceof SafeFetchError) || !["network", "timeout"].includes(error.reason)) {
        return https;
      }
    }
    const http = `http://${project.domain}/`;
    try {
      await this.fetcher.fetch(http, { readBodyIf: () => false, timeoutMs: 15_000, signal });
      return http;
    } catch {
      return https;
    }
  }

  private async store(
    run: AuditRunRow & { project: Project },
    config: z.infer<typeof RunConfigSchema>,
    crawl: CrawlResult,
    analysis: AuditAnalysis,
  ): Promise<void> {
    const isInternal = (url: string) =>
      hostMatchesDomain(url, run.project.domain, {
        includeSubdomains: run.project.includeSubdomains,
      });
    const issueCounts: Record<string, number> = {};
    for (const issue of analysis.issues) {
      issueCounts[issue.code] = (issueCounts[issue.code] ?? 0) + 1;
    }

    await this.prisma.$transaction(
      async (tx) => {
        const ids = new Map<string, string>();
        for (const batch of chunks(crawl.pages)) {
          const created = await tx.auditPage.createManyAndReturn({
            select: { id: true, url: true },
            data: batch.map((page) => {
              const facts = page.facts;
              const links = facts ? [...new Set(facts.links.map((link) => link.url))] : [];
              const internal = links.filter(isInternal);
              const robots = [...page.headerRobots, ...(facts?.robotsDirectives ?? [])];
              return {
                runId: run.id,
                url: page.url,
                depth: page.depth,
                statusCode: page.status,
                fetchError: page.fetchError,
                contentType: trim(page.contentType, 200),
                redirectTarget: trim(page.redirectTarget, 4000),
                title: trim(facts?.title, 1000),
                metaDescription: trim(facts?.metaDescription, 2000),
                h1: trim(facts?.h1[0], 1000),
                h1Count: facts?.h1.length ?? 0,
                canonical: trim(facts?.canonical, 4000),
                robotsMeta: robots.length > 0 ? robots.join(", ").slice(0, 500) : null,
                indexable: isIndexable(page),
                wordCount: facts?.wordCount ?? null,
                contentHash: facts?.contentHash ?? null,
                loadMs: page.loadMs === null ? null : Math.round(page.loadMs),
                bytes: page.bytes,
                inlinks: analysis.inlinks.get(page.url) ?? 0,
                outlinks: internal.length,
                externalLinks: links.length - internal.length,
                schemaTypes: facts?.schemaTypes.slice(0, 50) ?? [],
                lang: trim(facts?.lang, 35),
                hreflang: facts?.hreflang.slice(0, 100) ?? [],
                inSitemap: page.inSitemap,
              };
            }),
          });
          for (const row of created) ids.set(row.url, row.id);
        }

        const links = crawl.pages.flatMap((page) => {
          const fromPageId = ids.get(page.url);
          if (!page.facts || !fromPageId) return [];
          const unique = new Map(page.facts.links.map((link) => [link.url, link]));
          return [...unique.values()]
            .filter((link) => isInternal(link.url))
            .map((link) => ({
              runId: run.id,
              fromPageId,
              toUrl: link.url.slice(0, 4000),
              anchor: link.anchor || null,
              nofollow: link.nofollow,
            }));
        });
        for (const batch of chunks(links, 5000)) await tx.auditLink.createMany({ data: batch });

        const issues = analysis.issues.map((issue) => ({
          runId: run.id,
          pageId: issue.url ? (ids.get(issue.url) ?? null) : null,
          code: issue.code,
          severity: issueSeverity(issue.code),
          data: issue.data ?? {},
        }));
        for (const batch of chunks(issues, 5000)) await tx.auditIssue.createMany({ data: batch });

        await tx.auditRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            finishedAt: new Date(),
            config,
            pagesCrawled: crawl.pages.length,
            healthScore: analysis.healthScore,
            scoreVersion: HEALTH_SCORE_VERSION,
            stats: {
              ...analysis.stats,
              stoppedBy: crawl.stoppedBy,
              robots: {
                found: crawl.robots.found,
                unreachable: crawl.robots.unreachable,
                blockedAi: crawl.robots.blockedAi,
              },
              sitemaps: {
                read: crawl.sitemaps.read.length,
                failed: crawl.sitemaps.failed.length,
                urls: crawl.sitemaps.urls,
              },
              llmsTxt: { found: crawl.llmsTxt.found },
              issueCounts,
            },
          },
        });
      },
      { timeout: 5 * 60 * 1000, maxWait: 30_000 },
    );
  }

  /** Keeps pages, links and issues of the newest runs; older runs keep their summary. */
  private async prune(projectId: string): Promise<void> {
    const old = await this.prisma.auditRun.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      skip: AUDIT_RUNS_KEPT,
      select: { id: true },
    });
    if (old.length === 0) return;
    const runId = { in: old.map((run) => run.id) };
    await this.prisma.auditIssue.deleteMany({ where: { runId } });
    await this.prisma.auditLink.deleteMany({ where: { runId } });
    await this.prisma.auditPage.deleteMany({ where: { runId } });
  }

  private async detailOf(run: AuditRunRow): Promise<AuditRunDetail> {
    const previous =
      run.status === "COMPLETED"
        ? await this.prisma.auditRun.findFirst({
            where: {
              projectId: run.projectId,
              status: "COMPLETED",
              createdAt: { lt: run.createdAt },
            },
            orderBy: { createdAt: "desc" },
          })
        : null;
    const current = await this.issueRefs(run.id);
    // A previous run whose pages were pruned cannot be compared.
    const comparable =
      previous !== null &&
      (await this.prisma.auditPage.count({ where: { runId: previous.id } })) > 0;
    const changes =
      comparable && previous ? diffIssues(await this.issueRefs(previous.id), current) : null;

    const counts = new Map<string, number>();
    for (const issue of current) counts.set(issue.code, (counts.get(issue.code) ?? 0) + 1);
    const codes = new Set([...counts.keys(), ...(changes ? changes.keys() : [])]);
    const issues: AuditIssueSummary[] = [...codes].filter(isIssueCode).map((code) => ({
      code,
      severity: ISSUE_CATALOG[code].severity,
      category: ISSUE_CATALOG[code].category,
      count: counts.get(code) ?? 0,
      new: changes ? (changes.get(code)?.new ?? 0) : null,
      fixed: changes ? (changes.get(code)?.fixed ?? 0) : null,
    }));
    const order = { ERROR: 0, WARNING: 1, NOTICE: 2 };
    issues.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

    return {
      ...toAuditRun(run),
      issues,
      previous: previous?.finishedAt
        ? {
            id: previous.id,
            healthScore: previous.healthScore,
            finishedAt: previous.finishedAt.toISOString(),
          }
        : null,
    };
  }

  private issueRefs(runId: string): Promise<{ code: string; url: string | null }[]> {
    return this.prisma.$queryRaw<{ code: string; url: string | null }[]>`
      SELECT i.code, p.url
      FROM audit_issue i LEFT JOIN audit_page p ON p.id = i.page_id
      WHERE i.run_id = ${runId}::uuid`;
  }

  private async run(workspaceId: string, projectId: string, runId: string): Promise<AuditRunRow> {
    const run = await this.prisma.auditRun.findFirst({
      where: { id: runId, workspaceId, projectId },
    });
    if (!run) throw ProblemException.notFound("Audit not found.");
    return run;
  }

  private async project(workspaceId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }
}
