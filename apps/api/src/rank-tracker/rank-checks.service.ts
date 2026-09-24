import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { RANK_TRACKING_DEPTH } from "@seo-geo/contracts";
import {
  competitorRanks,
  dateInTimeZone,
  summarizeSerp,
  type CompetitorTarget,
  type DomainTarget,
  type SerpLike,
} from "@seo-geo/core";
import {
  DataForSeoError,
  MAX_TASKS_PER_POST,
  estimateSerpCost,
  getGoogleOrganicTaskAdvanced,
  getReadyGoogleOrganicTasks,
  postGoogleOrganicTasks,
  type DataForSeoClient,
  type GoogleOrganicSerp,
  type GoogleOrganicTaskInput,
} from "@seo-geo/dataforseo";
import { Prisma, type Device, type RankCheck } from "@seo-geo/db";

import { CredentialsService } from "../credentials/credentials.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { KeywordMetricsService } from "../keywords/keyword-metrics.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { QueueService } from "../tasks/queue.service.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { UsageService } from "../usage/usage.service.js";
import { EMPTY_SERP, snapshotContent, snapshotToSerp } from "./snapshot.js";

export const RANK_DISPATCH_JOB = "rank.dispatch";
export const RANK_CHECK_JOB = "rank.check";
export const RANK_COLLECT_JOB = "rank.collect";
export const RANK_CLEANUP_JOB = "rank.cleanup";

/** Standard queue: several times cheaper than live mode; results arrive within minutes. */
const SERP_MODE = "standard" as const;
/** AI Overviews that load asynchronously are only collected with this (refunded when absent). */
const LOAD_ASYNC_AI_OVERVIEW = true;
/** A SERP of the same query fetched this recently is reused instead of paying again. */
const SNAPSHOT_REUSE_HOURS = 20;
const SNAPSHOT_RETENTION_DAYS = 90;
/** Tasks not listed as ready after this long are fetched directly. */
const DIRECT_FETCH_AFTER_MINUTES = 20;
/** Checks still waiting after this long are given up. */
const PENDING_TIMEOUT_HOURS = 24;
/** Task results fetched per workspace and collector run. */
const COLLECT_BATCH = 200;
/** DataForSEO status codes that stop all posting for the workspace until someone acts. */
const ACCOUNT_BLOCKING_CODES = new Set([40100, 40101, 40200, 40201, 40210]);

/** Upper-bound cost of checking `count` keywords once. */
export function rankCheckCost(count: number): number {
  return estimateSerpCost({
    mode: SERP_MODE,
    depth: RANK_TRACKING_DEPTH,
    loadAsyncAiOverview: LOAD_ASYNC_AI_OVERVIEW,
    count,
  });
}

interface DueKeyword {
  id: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: Device;
}

interface Targets {
  own: DomainTarget;
  competitors: CompetitorTarget[];
}

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000);

/**
 * Daily SERP checks of tracked keywords: finds keywords that are due, posts DataForSEO
 * Standard-queue tasks (or reuses a SERP fetched earlier that day), and collects the results
 * into `rank_check` rows.
 */
@Injectable()
export class RankChecksService implements OnModuleInit {
  private readonly logger = new Logger("RankChecks");

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly usage: UsageService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
    private readonly registry: TaskRegistry,
    private readonly metrics: KeywordMetricsService,
  ) {}

  onModuleInit(): void {
    this.registry.registerScheduledJob({
      name: RANK_DISPATCH_JOB,
      cron: "7 * * * *",
      handler: () => this.dispatch(),
    });
    // One job per project at a time; a second one waits in the queue.
    this.registry.registerJob<{ projectId: string }>({
      name: RANK_CHECK_JOB,
      handler: (data) => this.checkProject(data.projectId),
      queue: { policy: "stately" },
    });
    this.registry.registerScheduledJob({
      name: RANK_COLLECT_JOB,
      cron: "* * * * *",
      handler: (signal) => this.collect(signal),
      queue: { policy: "stately", expireInSeconds: 10 * 60 },
    });
    this.registry.registerScheduledJob({
      name: RANK_CLEANUP_JOB,
      cron: "40 4 * * *",
      handler: () => this.cleanup(),
    });
  }

  /** Queues a check of the project's due keywords (at most one queued job per project). */
  async requestCheck(projectId: string): Promise<void> {
    await this.queue.send(RANK_CHECK_JOB, { projectId }, { singletonKey: projectId });
  }

  /** Hourly: queues a check for every active project that tracks keywords. */
  async dispatch(): Promise<void> {
    const projects = await this.prisma.project.findMany({
      where: { archivedAt: null, trackedKeywords: { some: {} } },
      select: { id: true },
    });
    for (const project of projects) await this.requestCheck(project.id);
  }

  /** Posts SERP tasks for the project's keywords that have no check for the current period. */
  async checkProject(projectId: string, now = new Date()): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.archivedAt) return;
    const today = dateInTimeZone(now, project.timezone);
    const due = await this.dueKeywords(projectId, today);
    if (due.length === 0) return;

    const client = await this.credentials.findDataForSeoClient(project.workspaceId);
    if (!client) return;
    const limit = await this.usage.blockingLimit(project.workspaceId, rankCheckCost(due.length));
    if (limit) {
      await this.notifications.notifyRolesOnce(
        project.workspaceId,
        ["owner", "admin"],
        {
          type: "rank.budget_blocked",
          title: "Rank checks are paused: the monthly budget is reached",
          body: `Raise the budget of $${limit.toFixed(2)} to resume daily checks.`,
          data: { project: project.name, limitUsd: limit.toNumber() },
        },
        hoursAgo(now, 24),
      );
      return;
    }
    await this.refreshMetrics(project.workspaceId, projectId, due);

    const checks = await this.prisma.rankCheck.createManyAndReturn({
      data: due.map((keyword) => ({
        workspaceId: project.workspaceId,
        projectId,
        trackedKeywordId: keyword.id,
        checkedOn: new Date(`${today}T00:00:00Z`),
        depth: RANK_TRACKING_DEPTH,
      })),
      skipDuplicates: true,
    });
    const keywordById = new Map(due.map((keyword) => [keyword.id, keyword]));
    const targets = await this.targets(projectId);

    const toPost: { check: RankCheck; keyword: DueKeyword }[] = [];
    for (const check of checks) {
      const keyword = keywordById.get(check.trackedKeywordId);
      if (!keyword) continue;
      if (!(await this.reuseSnapshot(check, keyword, targets, now)))
        toPost.push({ check, keyword });
    }

    for (let index = 0; index < toPost.length; index += MAX_TASKS_PER_POST) {
      const chunk = toPost.slice(index, index + MAX_TASKS_PER_POST);
      const posted = await this.post(client, project.workspaceId, projectId, chunk, now);
      if (!posted) {
        // Nothing more is posted today; the next hourly dispatch tries again.
        await this.prisma.rankCheck.deleteMany({
          where: { id: { in: toPost.slice(index).map(({ check }) => check.id) } },
        });
        return;
      }
    }
  }

  /**
   * Search volumes and difficulty change over time: metrics of due keywords that are older
   * than their TTL are fetched again (the enrichment job skips fresh ones and checks the
   * budget).
   */
  private async refreshMetrics(
    workspaceId: string,
    projectId: string,
    keywords: readonly DueKeyword[],
  ): Promise<void> {
    const markets = new Map<
      string,
      { locationCode: number; languageCode: string; keywords: string[] }
    >();
    for (const keyword of keywords) {
      const key = `${keyword.locationCode}:${keyword.languageCode}`;
      const market = markets.get(key) ?? {
        locationCode: keyword.locationCode,
        languageCode: keyword.languageCode,
        keywords: [],
      };
      market.keywords.push(keyword.keyword);
      markets.set(key, market);
    }
    for (const market of markets.values()) {
      await this.metrics.requestEnrichment({ workspaceId, projectId, ...market });
    }
  }

  private dueKeywords(projectId: string, today: string): Promise<DueKeyword[]> {
    return this.prisma.$queryRaw<DueKeyword[]>`
      SELECT tk.id, tk.keyword, tk.location_code AS "locationCode",
        tk.language_code AS "languageCode", tk.device
      FROM tracked_keyword tk
      WHERE tk.project_id = ${projectId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM rank_check rc
          WHERE rc.tracked_keyword_id = tk.id
            AND rc.checked_on > ${today}::date - (CASE WHEN tk.frequency = 'WEEKLY' THEN 7 ELSE 1 END)
        )
      ORDER BY tk.created_at, tk.id`;
  }

  /** Completes a check from a SERP of the same query fetched recently, at no cost. */
  private async reuseSnapshot(
    check: RankCheck,
    keyword: DueKeyword,
    targets: Targets,
    now: Date,
  ): Promise<boolean> {
    const snapshot = await this.prisma.serpSnapshot.findFirst({
      where: {
        searchEngine: "GOOGLE",
        keyword: keyword.keyword,
        locationCode: keyword.locationCode,
        languageCode: keyword.languageCode,
        device: keyword.device,
        depth: { gte: check.depth },
        fetchedAt: { gte: hoursAgo(now, SNAPSHOT_REUSE_HOURS) },
      },
      orderBy: { fetchedAt: "desc" },
    });
    if (!snapshot) return false;
    await this.saveResult(check, snapshotToSerp(snapshot), targets, {
      checkedAt: snapshot.fetchedAt,
      snapshotId: snapshot.id,
    });
    return true;
  }

  /** Posts one chunk; returns `false` when the account cannot post at all right now. */
  private async post(
    client: DataForSeoClient,
    workspaceId: string,
    projectId: string,
    chunk: { check: RankCheck; keyword: DueKeyword }[],
    now: Date,
  ): Promise<boolean> {
    const inputs: GoogleOrganicTaskInput[] = chunk.map(({ check, keyword }) => ({
      keyword: keyword.keyword,
      locationCode: keyword.locationCode,
      languageCode: keyword.languageCode,
      device: keyword.device === "MOBILE" ? "mobile" : "desktop",
      depth: check.depth,
      loadAsyncAiOverview: LOAD_ASYNC_AI_OVERVIEW,
      tag: check.id,
    }));

    let result: Awaited<ReturnType<typeof postGoogleOrganicTasks>>;
    try {
      result = await postGoogleOrganicTasks(client, inputs);
    } catch (error) {
      if (error instanceof DataForSeoError) {
        await this.reportAccountProblem(workspaceId, error, now);
        this.logger.warn(`Posting SERP tasks failed: ${error.message}`);
        return false;
      }
      throw error;
    }

    const byTag = new Map(chunk.map((entry) => [entry.check.id, entry.check]));
    const posted = result.tasks.filter((task) => task.ok);
    await this.prisma.$transaction(async (tx) => {
      for (const [index, task] of result.tasks.entries()) {
        const check = (task.tag ? byTag.get(task.tag) : undefined) ?? chunk[index]?.check;
        if (!check) continue;
        await tx.rankCheck.update({
          where: { id: check.id },
          data: task.ok
            ? {
                providerTaskId: task.id,
                postedAt: now,
                costUsd: new Prisma.Decimal(task.cost),
              }
            : { status: "FAILED", error: task.error.message.slice(0, 500) },
        });
      }
      if (result.cost > 0 || posted.length > 0) {
        await this.usage.record(
          {
            workspaceId,
            projectId,
            provider: "DATAFORSEO",
            operation: "serp.google.organic.task_post",
            units: posted.length,
            costUsd: result.cost,
          },
          tx,
        );
      }
    });
    return true;
  }

  private async reportAccountProblem(
    workspaceId: string,
    error: DataForSeoError,
    now: Date,
  ): Promise<void> {
    if (error.statusCode === undefined || !ACCOUNT_BLOCKING_CODES.has(error.statusCode)) return;
    await this.notifications.notifyRolesOnce(
      workspaceId,
      ["owner", "admin"],
      {
        type: "dataforseo.account_blocked",
        title: "DataForSEO refused requests",
        body: error.message,
        data: { code: error.statusCode },
      },
      hoursAgo(now, 24),
    );
  }

  /** Every minute: collects finished SERP tasks of all workspaces. */
  async collect(signal?: AbortSignal, now = new Date()): Promise<void> {
    const workspaces = await this.prisma.rankCheck.findMany({
      where: { status: "PENDING", providerTaskId: { not: null } },
      distinct: ["workspaceId"],
      select: { workspaceId: true },
    });
    for (const { workspaceId } of workspaces) {
      if (signal?.aborted) return;
      try {
        await this.collectWorkspace(workspaceId, now, signal);
      } catch (error) {
        this.logger.warn(`Collecting SERPs failed: ${String(error)}`);
      }
    }
  }

  private async collectWorkspace(
    workspaceId: string,
    now: Date,
    signal?: AbortSignal,
  ): Promise<void> {
    const pending = await this.prisma.rankCheck.findMany({
      where: { workspaceId, status: "PENDING", providerTaskId: { not: null } },
      orderBy: { postedAt: "asc" },
      take: 5000,
    });
    const timeout = hoursAgo(now, PENDING_TIMEOUT_HOURS);
    const expired = pending.filter((check) => check.postedAt && check.postedAt < timeout);
    if (expired.length > 0) {
      await this.prisma.rankCheck.updateMany({
        where: { id: { in: expired.map((check) => check.id) }, status: "PENDING" },
        data: { status: "FAILED", error: "The SERP was not delivered within 24 hours." },
      });
    }

    const client = await this.credentials.findDataForSeoClient(workspaceId);
    if (!client) return;
    const ready = new Set((await getReadyGoogleOrganicTasks(client)).tasks.map((task) => task.id));
    const directAfter = new Date(now.getTime() - DIRECT_FETCH_AFTER_MINUTES * 60_000);
    const due = pending
      .filter((check) => !expired.includes(check))
      .filter(
        (check) =>
          (check.providerTaskId && ready.has(check.providerTaskId)) ||
          (check.postedAt !== null && check.postedAt < directAfter),
      )
      .slice(0, COLLECT_BATCH);

    const targets = new Map<string, Targets>();
    for (const check of due) {
      if (signal?.aborted) return;
      const taskId = check.providerTaskId as string;
      let result: Awaited<ReturnType<typeof getGoogleOrganicTaskAdvanced>>;
      try {
        result = await getGoogleOrganicTaskAdvanced(client, taskId);
      } catch (error) {
        if (error instanceof DataForSeoError && !error.retryable) {
          await this.fail(check.id, error.message);
          continue;
        }
        throw error;
      }
      if (result.status === "pending") continue;

      let projectTargets = targets.get(check.projectId);
      if (!projectTargets) {
        projectTargets = await this.targets(check.projectId);
        targets.set(check.projectId, projectTargets);
      }
      const serp = result.status === "ready" ? result.serp : null;
      const snapshotId = serp ? await this.saveSnapshot(check, serp, now) : null;
      await this.saveResult(check, serp ?? EMPTY_SERP, projectTargets, {
        checkedAt: serp?.fetchedAt ? new Date(serp.fetchedAt) : now,
        snapshotId,
      });
    }
  }

  private async saveResult(
    check: RankCheck,
    serp: SerpLike,
    targets: Targets,
    details: { checkedAt: Date; snapshotId: string | null },
  ): Promise<void> {
    const summary = summarizeSerp(serp, targets.own);
    try {
      await this.prisma.rankCheck.update({
        where: { id: check.id },
        data: {
          status: "COMPLETED",
          checkedAt: details.checkedAt,
          position: summary.position,
          rankAbsolute: summary.rankAbsolute,
          url: summary.url,
          serpFeatures: summary.serpFeatures,
          ownedFeatures: summary.ownedFeatures,
          aiOverviewPresent: summary.aiOverviewPresent,
          aiOverviewCited: summary.aiOverviewCited,
          competitorRanks: Object.fromEntries(
            Object.entries(competitorRanks(serp, targets.competitors)).map(([id, rank]) => [
              id,
              { position: rank.position, url: rank.url },
            ]),
          ),
          serpSnapshotId: details.snapshotId,
          error: null,
        },
      });
    } catch (error) {
      // The keyword was deleted while its SERP was being collected.
      if (!isNotFound(error)) throw error;
    }
  }

  /** Stores the SERP for reuse and history; a deeper SERP of the same day wins. */
  private async saveSnapshot(
    check: RankCheck,
    serp: GoogleOrganicSerp,
    now: Date,
  ): Promise<string | null> {
    const keyword = await this.prisma.trackedKeyword.findUnique({
      where: { id: check.trackedKeywordId },
    });
    if (!keyword) return null;
    const fetchedAt = serp.fetchedAt ? new Date(serp.fetchedAt) : now;
    const identity = {
      searchEngine: keyword.searchEngine,
      keyword: keyword.keyword,
      locationCode: keyword.locationCode,
      languageCode: keyword.languageCode,
      device: keyword.device,
      fetchedOn: new Date(`${fetchedAt.toISOString().slice(0, 10)}T00:00:00Z`),
    };
    const content = { ...snapshotContent(serp, check.depth), depth: check.depth, fetchedAt };
    const where = {
      searchEngine_keyword_locationCode_languageCode_device_fetchedOn: identity,
    };
    const existing = await this.prisma.serpSnapshot.findUnique({ where });
    if (existing) {
      if (existing.depth > check.depth) return existing.id;
      return (await this.prisma.serpSnapshot.update({ where, data: content })).id;
    }
    try {
      return (await this.prisma.serpSnapshot.create({ data: { ...identity, ...content } })).id;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return (await this.prisma.serpSnapshot.findUnique({ where }))?.id ?? null;
    }
  }

  private async fail(checkId: string, message: string): Promise<void> {
    await this.prisma.rankCheck.updateMany({
      where: { id: checkId, status: "PENDING" },
      data: { status: "FAILED", error: message.slice(0, 500) },
    });
  }

  /** The project's site and its competitors' domains. */
  private async targets(projectId: string): Promise<Targets> {
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { brandEntities: { where: { kind: "COMPETITOR" } } },
    });
    return {
      own: [{ domain: project.domain, includeSubdomains: project.includeSubdomains }],
      competitors: project.brandEntities.map((brand) => ({
        id: brand.id,
        target: brand.domains.map((domain) => ({ domain, includeSubdomains: true })),
      })),
    };
  }

  /** Daily: drops SERP snapshots past their retention. */
  async cleanup(now = new Date()): Promise<void> {
    await this.prisma.serpSnapshot.deleteMany({
      where: { fetchedAt: { lt: new Date(now.getTime() - SNAPSHOT_RETENTION_DAYS * 86_400_000) } },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
