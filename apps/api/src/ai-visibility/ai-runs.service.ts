import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { AI_PLATFORM_METHODS, findMarket, type AiPlatform } from "@seo-geo/contracts";
import {
  MENTION_DETECTOR_VERSION,
  SENTIMENT_CLASSIFIER_VERSION,
  addDays,
  dateInTimeZone,
  mentionContext,
  parseSentiment,
  sentimentPrompt,
} from "@seo-geo/core";
import { normalizeUrl } from "@seo-geo/core/audit";
import {
  DataForSeoError,
  MAX_TASKS_PER_POST,
  getAiModeTask,
  getGoogleOrganicTaskAdvanced,
  getLlmResponsesLive,
  getLlmScraperTask,
  getReadyAiModeTasks,
  getReadyGoogleOrganicTasks,
  getReadyLlmScraperTasks,
  postAiModeTasks,
  postGoogleOrganicTasks,
  postLlmScraperTasks,
  type AiAnswer,
  type DataForSeoClient,
  type PostedTask,
  type ReadyTask,
} from "@seo-geo/dataforseo";
import { Prisma, type AiRun, type Project } from "@seo-geo/db";

import { CredentialsService } from "../credentials/credentials.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";
import { QueueService } from "../tasks/queue.service.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { UsageService } from "../usage/usage.service.js";
import {
  aiOverviewAnswer,
  analysisContext,
  analyzeAnswer,
  answerDetails,
  withoutNul,
  type AnalysisContext,
} from "./ai-analysis.js";
import { AiModelsService } from "./ai-models.service.js";
import {
  FALLBACK_MODELS,
  PERIOD_DAYS,
  RESPONSES_PLATFORMS,
  SCRAPER_PLATFORMS,
  SENTIMENT_COST_PER_MENTION,
  answerCost,
  isModelPlatform,
  modelOf,
  type DefaultModels,
} from "./ai-platforms.js";
import { loadAiSettings } from "./ai-settings.js";

export const AI_DISPATCH_JOB = "ai.dispatch";
export const AI_CHECK_JOB = "ai.check";
export const AI_COLLECT_JOB = "ai.collect";
export const AI_ANSWER_JOB = "ai.answer";
export const AI_SENTIMENT_JOB = "ai.sentiment";

/** Tasks not listed as ready after this long are fetched directly. */
const DIRECT_FETCH_AFTER_MINUTES = 20;
/** Answers still missing after this long are given up. */
const PENDING_TIMEOUT_HOURS = 24;
/** Task results fetched per workspace and collector run. */
const COLLECT_BATCH = 200;
/** Live answers requested at the same time, and per pass. */
const LIVE_CONCURRENCY = 4;
const LIVE_BATCH = 200;
/** A pass stops starting live requests after this long (the job expires after 10 minutes). */
const LIVE_PASS_MS = 4 * 60_000;
/** A live request started this long ago without a result was cut short (e.g. by a restart). */
const LIVE_CLAIM_TIMEOUT_MINUTES = 30;
/**
 * Live answers with web search can take minutes. They are not retried within a request: one
 * that timed out may have been billed, so it is asked again in a later pass instead.
 */
const LIVE_CLIENT = { timeoutMs: 180_000, maxRetries: 0 };
/** Mentions of answers completed this recently are classified; older ones are left alone. */
const SENTIMENT_WINDOW_HOURS = 48;
const SENTIMENT_BATCH = 200;
/** Known pages from Search Console: pages with data in this many recent days. */
const SEARCH_CONSOLE_PAGE_DAYS = 90;
/** DataForSEO status codes that stop all requests for the workspace until someone acts. */
const ACCOUNT_BLOCKING_CODES = new Set([40100, 40101, 40200, 40201, 40210]);

/** Ledger operation of each platform's requests. */
const OPERATIONS: Record<AiPlatform, string> = {
  CHATGPT: "ai_optimization.chat_gpt.llm_scraper.task_post",
  GEMINI: "ai_optimization.gemini.llm_scraper.task_post",
  PERPLEXITY: "ai_optimization.perplexity.llm_responses.live",
  CLAUDE: "ai_optimization.claude.llm_responses.live",
  GOOGLE_AI_MODE: "serp.google.ai_mode.task_post",
  GOOGLE_AI_OVERVIEW: "serp.google.organic.task_post",
};
const SENTIMENT_OPERATION = "ai_optimization.chat_gpt.llm_responses.live";

const PROMPT_FIELDS = { id: true, text: true, locationCode: true, languageCode: true } as const;

interface PromptToAsk {
  id: string;
  text: string;
  locationCode: number;
  languageCode: string;
}

type RunToComplete = Pick<AiRun, "id" | "workspaceId" | "projectId" | "platform" | "model">;

const hoursAgo = (now: Date, hours: number) => new Date(now.getTime() - hours * 3_600_000);
const minutesAgo = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);
const runKey = (promptId: string, platform: AiPlatform, sampleIndex: number) =>
  `${promptId}:${platform}:${sampleIndex}`;

/** Analysis contexts of the projects touched by one job run, loaded once each. */
class AnalysisContexts {
  private readonly contexts = new Map<string, Promise<AnalysisContext>>();

  constructor(private readonly load: (projectId: string) => Promise<AnalysisContext>) {}

  get(projectId: string): Promise<AnalysisContext> {
    let context = this.contexts.get(projectId);
    if (!context) {
      context = this.load(projectId);
      this.contexts.set(projectId, context);
    }
    return context;
  }

  forget(projectId: string): void {
    this.contexts.delete(projectId);
  }
}

/**
 * Asks the project's prompts on AI platforms on schedule (docs/geo-aeo.md): finds the answers
 * due in the current period, posts Standard-queue tasks (ChatGPT, Gemini, Google AI Mode and
 * AI Overview), answers Claude and Perplexity live, collects the results, detects brand
 * mentions and citations, and optionally classifies the tone of mentions.
 */
@Injectable()
export class AiRunsService implements OnModuleInit {
  private readonly logger = new Logger("AiRuns");

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly usage: UsageService,
    private readonly notifications: NotificationsService,
    private readonly queue: QueueService,
    private readonly registry: TaskRegistry,
    private readonly models: AiModelsService,
  ) {}

  onModuleInit(): void {
    this.registry.registerScheduledJob({
      name: AI_DISPATCH_JOB,
      cron: "23 * * * *",
      handler: () => this.dispatch(),
    });
    // One job per project at a time; a second one waits in the queue.
    this.registry.registerJob<{ projectId: string }>({
      name: AI_CHECK_JOB,
      handler: (data) => this.checkProject(data.projectId),
      queue: { policy: "stately" },
    });
    this.registry.registerScheduledJob({
      name: AI_COLLECT_JOB,
      cron: "* * * * *",
      handler: (signal) => this.collect(signal),
      queue: { policy: "stately", expireInSeconds: 10 * 60 },
    });
    this.registry.registerScheduledJob({
      name: AI_ANSWER_JOB,
      cron: "* * * * *",
      handler: (signal) => this.answerLive(signal),
      queue: { policy: "stately", expireInSeconds: 10 * 60 },
    });
    this.registry.registerScheduledJob({
      name: AI_SENTIMENT_JOB,
      cron: "*/5 * * * *",
      handler: (signal) => this.classifySentiment(signal),
      queue: { policy: "stately", expireInSeconds: 15 * 60 },
    });
  }

  /** Queues a check of the project's due answers (at most one queued job per project). */
  async requestCheck(projectId: string): Promise<void> {
    await this.queue.send(AI_CHECK_JOB, { projectId }, { singletonKey: projectId });
  }

  /** Hourly: queues a check for every active project with active prompts. */
  async dispatch(): Promise<void> {
    const projects = await this.prisma.project.findMany({
      where: { archivedAt: null, prompts: { some: { active: true } } },
      select: { id: true },
    });
    for (const project of projects) await this.requestCheck(project.id);
  }

  // ── Asking ────────────────────────────────────────────────────────────────────────

  /**
   * Creates the answers due in the current period (per prompt, platform and sample) and
   * posts the queued ones; live ones are answered by {@link answerLive}.
   */
  async checkProject(projectId: string, now = new Date()): Promise<void> {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.archivedAt) return;
    const settings = await loadAiSettings(this.prisma, projectId);
    if (settings.platforms.length === 0) return;

    const today = dateInTimeZone(now, project.timezone);
    const since = addDays(today, 1 - PERIOD_DAYS[settings.frequency]);
    const [prompts, existing] = await Promise.all([
      this.prisma.prompt.findMany({
        where: { projectId, active: true },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: PROMPT_FIELDS,
      }),
      this.prisma.aiRun.findMany({
        where: { projectId, runOn: { gte: asDate(since) } },
        select: { promptId: true, platform: true, sampleIndex: true },
      }),
    ]);
    const asked = new Set(
      existing.map((run) => runKey(run.promptId, run.platform, run.sampleIndex)),
    );
    const due: { prompt: PromptToAsk; platform: AiPlatform; sampleIndex: number }[] = [];
    for (const prompt of prompts) {
      for (const platform of settings.platforms) {
        for (let sampleIndex = 0; sampleIndex < settings.samples; sampleIndex++) {
          if (!asked.has(runKey(prompt.id, platform, sampleIndex))) {
            due.push({ prompt, platform, sampleIndex });
          }
        }
      }
    }
    if (due.length === 0) return;

    const client = await this.credentials.findDataForSeoClient(project.workspaceId);
    if (!client) return;
    const defaults: DefaultModels = due.some((entry) => isModelPlatform(entry.platform))
      ? await this.models.defaults(client)
      : { ...FALLBACK_MODELS };
    const brands = settings.sentiment
      ? await this.prisma.brandEntity.count({ where: { projectId } })
      : 0;
    const estimate = due.reduce(
      (sum, entry) =>
        sum +
        answerCost(entry.platform, modelOf(settings, entry.platform, defaults)) +
        brands * SENTIMENT_COST_PER_MENTION,
      0,
    );
    const limit = await this.usage.blockingLimit(project.workspaceId, estimate);
    if (limit) {
      await this.notifyBudget(project, limit, now);
      return;
    }

    const runs = await this.prisma.aiRun.createManyAndReturn({
      data: due.map((entry) => ({
        workspaceId: project.workspaceId,
        projectId,
        promptId: entry.prompt.id,
        platform: entry.platform,
        method: AI_PLATFORM_METHODS[entry.platform],
        model: modelOf(settings, entry.platform, defaults),
        sampleIndex: entry.sampleIndex,
        runOn: asDate(today),
      })),
      skipDuplicates: true,
    });
    const promptById = new Map(prompts.map((prompt) => [prompt.id, prompt]));
    if (!(await this.postTasks(client, project, runs, promptById, now))) {
      // Nothing more is asked in this period until the next hourly dispatch.
      await this.prisma.aiRun.deleteMany({
        where: {
          id: { in: runs.map((run) => run.id) },
          status: "PENDING",
          providerTaskId: null,
          postedAt: null,
        },
      });
    }
  }

  /** Posts the queued platforms' tasks; `false` when the account cannot post right now. */
  private async postTasks(
    client: DataForSeoClient,
    project: Project,
    runs: readonly AiRun[],
    prompts: ReadonlyMap<string, PromptToAsk>,
    now: Date,
  ): Promise<boolean> {
    const byPlatform = new Map<AiPlatform, AiRun[]>();
    for (const run of runs) {
      if (isModelPlatform(run.platform)) continue;
      byPlatform.set(run.platform, [...(byPlatform.get(run.platform) ?? []), run]);
    }
    for (const [platform, group] of byPlatform) {
      for (let index = 0; index < group.length; index += MAX_TASKS_PER_POST) {
        const chunk = group.slice(index, index + MAX_TASKS_PER_POST);
        let result: { cost: number; tasks: PostedTask[] };
        try {
          result = await this.postChunk(client, project, platform, chunk, prompts);
        } catch (error) {
          if (error instanceof DataForSeoError) {
            await this.reportAccountProblem(project.workspaceId, error, now);
            this.logger.warn(`Posting ${platform} tasks failed: ${error.message}`);
            return false;
          }
          throw error;
        }
        await this.savePosted(project, platform, chunk, result, now);
      }
    }
    return true;
  }

  private postChunk(
    client: DataForSeoClient,
    project: Project,
    platform: AiPlatform,
    chunk: readonly AiRun[],
    prompts: ReadonlyMap<string, PromptToAsk>,
  ): Promise<{ cost: number; tasks: PostedTask[] }> {
    const inputs = chunk.flatMap((run) => {
      const prompt = prompts.get(run.promptId);
      if (!prompt) return [];
      return [
        {
          prompt: prompt.text,
          locationCode: prompt.locationCode,
          languageCode: prompt.languageCode,
          tag: run.id,
        },
      ];
    });
    const device = project.defaultDevice === "MOBILE" ? "mobile" : "desktop";
    switch (platform) {
      case "CHATGPT":
      case "GEMINI":
        return postLlmScraperTasks(client, SCRAPER_PLATFORMS[platform], inputs);
      case "GOOGLE_AI_MODE":
        return postAiModeTasks(
          client,
          inputs.map((input) => ({ ...input, device })),
        );
      case "GOOGLE_AI_OVERVIEW":
        // The AI Overview Google shows for the prompt as a search, on the first results page.
        return postGoogleOrganicTasks(
          client,
          inputs.map((input) => ({
            keyword: input.prompt,
            locationCode: input.locationCode,
            languageCode: input.languageCode,
            device,
            depth: 10,
            loadAsyncAiOverview: true,
            tag: input.tag,
          })),
        );
      default:
        throw new Error(`${platform} answers live`);
    }
  }

  private async savePosted(
    project: Project,
    platform: AiPlatform,
    chunk: readonly AiRun[],
    result: { cost: number; tasks: PostedTask[] },
    now: Date,
  ): Promise<void> {
    const byId = new Map(chunk.map((run) => [run.id, run]));
    const posted = result.tasks.filter((task) => task.ok);
    await this.prisma.$transaction(async (tx) => {
      for (const [index, task] of result.tasks.entries()) {
        const run = (task.tag ? byId.get(task.tag) : undefined) ?? chunk[index];
        if (!run) continue;
        await tx.aiRun.update({
          where: { id: run.id },
          data: task.ok
            ? { providerTaskId: task.id, postedAt: now, costUsd: new Prisma.Decimal(task.cost) }
            : { status: "FAILED", completedAt: now, error: task.error.message.slice(0, 500) },
        });
      }
      if (result.cost > 0 || posted.length > 0) {
        await this.usage.record(
          {
            workspaceId: project.workspaceId,
            projectId: project.id,
            provider: "DATAFORSEO",
            operation: OPERATIONS[platform],
            units: posted.length,
            costUsd: result.cost,
          },
          tx,
        );
      }
    });
  }

  // ── Collecting queued answers ─────────────────────────────────────────────────────

  /** Every minute: collects finished tasks of all workspaces. */
  async collect(signal?: AbortSignal, now = new Date()): Promise<void> {
    const workspaces = await this.prisma.aiRun.findMany({
      where: { status: "PENDING", providerTaskId: { not: null } },
      distinct: ["workspaceId"],
      select: { workspaceId: true },
    });
    const contexts = this.contexts(now);
    for (const { workspaceId } of workspaces) {
      if (signal?.aborted) return;
      try {
        await this.collectWorkspace(workspaceId, contexts, now, signal);
      } catch (error) {
        this.logger.warn(`Collecting AI answers failed: ${String(error)}`);
      }
    }
  }

  private async collectWorkspace(
    workspaceId: string,
    contexts: AnalysisContexts,
    now: Date,
    signal?: AbortSignal,
  ): Promise<void> {
    const pending = await this.prisma.aiRun.findMany({
      where: { workspaceId, status: "PENDING", providerTaskId: { not: null } },
      orderBy: { postedAt: "asc" },
      take: 5000,
    });
    const timeout = hoursAgo(now, PENDING_TIMEOUT_HOURS);
    const expired = new Set(
      pending.filter((run) => run.postedAt && run.postedAt < timeout).map((run) => run.id),
    );
    if (expired.size > 0) {
      await this.prisma.aiRun.updateMany({
        where: { id: { in: [...expired] }, status: "PENDING" },
        data: {
          status: "FAILED",
          completedAt: now,
          error: "The answer was not delivered within 24 hours.",
        },
      });
    }

    const client = await this.credentials.findDataForSeoClient(workspaceId);
    if (!client) return;
    const ready = new Set<string>();
    for (const platform of new Set(pending.map((run) => run.platform))) {
      for (const task of await this.readyTasks(client, platform)) ready.add(task.id);
    }
    const directAfter = minutesAgo(now, DIRECT_FETCH_AFTER_MINUTES);
    const due = pending
      .filter((run) => !expired.has(run.id))
      .filter(
        (run) =>
          (run.providerTaskId !== null && ready.has(run.providerTaskId)) ||
          (run.postedAt !== null && run.postedAt < directAfter),
      )
      .slice(0, COLLECT_BATCH);

    for (const run of due) {
      if (signal?.aborted) return;
      let result: { status: "pending" } | { status: "done"; answer: AiAnswer | null };
      try {
        result = await this.fetchTask(client, run);
      } catch (error) {
        if (error instanceof DataForSeoError && !error.retryable) {
          await this.fail(run.id, error.message, now);
          continue;
        }
        throw error;
      }
      if (result.status === "pending") continue;
      await this.complete(run, result.answer, contexts, now);
    }
  }

  private async readyTasks(client: DataForSeoClient, platform: AiPlatform): Promise<ReadyTask[]> {
    switch (platform) {
      case "CHATGPT":
      case "GEMINI":
        return (await getReadyLlmScraperTasks(client, SCRAPER_PLATFORMS[platform])).tasks;
      case "GOOGLE_AI_MODE":
        return (await getReadyAiModeTasks(client)).tasks;
      case "GOOGLE_AI_OVERVIEW":
        // Shared with the rank tracker; each collector only takes the tasks it posted.
        return (await getReadyGoogleOrganicTasks(client)).tasks;
      default:
        return [];
    }
  }

  private async fetchTask(
    client: DataForSeoClient,
    run: AiRun,
  ): Promise<{ status: "pending" } | { status: "done"; answer: AiAnswer | null }> {
    const id = run.providerTaskId as string;
    if (run.platform === "GOOGLE_AI_OVERVIEW") {
      const result = await getGoogleOrganicTaskAdvanced(client, id);
      if (result.status === "pending") return result;
      return {
        status: "done",
        answer: result.status === "ready" ? aiOverviewAnswer(result.serp) : null,
      };
    }
    const result =
      run.platform === "GOOGLE_AI_MODE"
        ? await getAiModeTask(client, id)
        : run.platform === "CHATGPT" || run.platform === "GEMINI"
          ? await getLlmScraperTask(client, SCRAPER_PLATFORMS[run.platform], id)
          : null;
    if (!result) throw new Error(`${run.platform} answers live`);
    if (result.status === "pending") return result;
    return { status: "done", answer: result.status === "ready" ? result.answer : null };
  }

  // ── Live answers ──────────────────────────────────────────────────────────────────

  /**
   * Every minute: asks Claude and Perplexity the prompts that are due, a few at a time. A run
   * is claimed (`posted_at`) before its request, so that a request cut short is never sent
   * twice: it may have been billed.
   */
  async answerLive(signal?: AbortSignal, now = new Date()): Promise<void> {
    const deadline = Date.now() + LIVE_PASS_MS;
    await this.prisma.aiRun.updateMany({
      where: {
        status: "PENDING",
        method: "llm_responses",
        postedAt: { lt: minutesAgo(now, LIVE_CLAIM_TIMEOUT_MINUTES) },
      },
      data: { status: "FAILED", completedAt: now, error: "The answer was not received." },
    });
    await this.prisma.aiRun.updateMany({
      where: {
        status: "PENDING",
        method: "llm_responses",
        postedAt: null,
        createdAt: { lt: hoursAgo(now, PENDING_TIMEOUT_HOURS) },
      },
      data: {
        status: "FAILED",
        completedAt: now,
        error: "The prompt could not be asked within 24 hours.",
      },
    });

    const queue = await this.prisma.aiRun.findMany({
      where: { status: "PENDING", method: "llm_responses", postedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: LIVE_BATCH,
      include: { prompt: { select: PROMPT_FIELDS } },
    });
    if (queue.length === 0) return;

    const contexts = this.contexts(now);
    const clients = new Map<string, Promise<DataForSeoClient | null>>();
    const stopped = new Set<string>();
    let next = 0;
    const work = async () => {
      while (next < queue.length && !signal?.aborted && Date.now() < deadline) {
        const run = queue[next++] as (typeof queue)[number];
        if (stopped.has(run.workspaceId)) continue;
        let client = clients.get(run.workspaceId);
        if (!client) {
          client = this.credentials.findDataForSeoClient(run.workspaceId, LIVE_CLIENT);
          clients.set(run.workspaceId, client);
        }
        try {
          if (!(await this.answerOne(run, await client, contexts))) stopped.add(run.workspaceId);
        } catch (error) {
          this.logger.warn(`Answering a prompt live failed: ${String(error)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: LIVE_CONCURRENCY }, work));
  }

  /** Answers one run; `false` when the workspace cannot ask anything more in this pass. */
  private async answerOne(
    run: AiRun & { prompt: PromptToAsk },
    client: DataForSeoClient | null,
    contexts: AnalysisContexts,
  ): Promise<boolean> {
    if (!client || !isModelPlatform(run.platform)) return false;
    const platform = RESPONSES_PLATFORMS[run.platform];
    const model = run.model ?? FALLBACK_MODELS[run.platform];
    const now = new Date();
    const limit = await this.usage.blockingLimit(run.workspaceId, answerCost(run.platform, model));
    if (limit) {
      await this.dropUnasked(run.workspaceId);
      const project = await this.prisma.project.findUnique({ where: { id: run.projectId } });
      if (project) await this.notifyBudget(project, limit, now);
      return false;
    }
    const claimed = await this.prisma.aiRun.updateMany({
      where: { id: run.id, status: "PENDING", postedAt: null },
      data: { postedAt: now },
    });
    if (claimed.count === 0) return true;

    let response: Awaited<ReturnType<typeof getLlmResponsesLive>>;
    try {
      response = await getLlmResponsesLive(client, platform, {
        prompt: run.prompt.text,
        model,
        webSearch: true,
        webSearchCountry: findMarket(run.prompt.locationCode)?.countryCode,
        tag: run.id,
      });
    } catch (error) {
      if (!(error instanceof DataForSeoError)) throw error;
      if (isAccountBlocking(error)) {
        // Refused requests are not billed: ask again once the account works.
        await this.prisma.aiRun.deleteMany({ where: { id: run.id, status: "PENDING" } });
        await this.dropUnasked(run.workspaceId);
        await this.reportAccountProblem(run.workspaceId, error, now);
        return false;
      }
      if (error.retryable) {
        await this.prisma.aiRun.updateMany({
          where: { id: run.id, status: "PENDING" },
          data: { postedAt: null },
        });
        this.logger.warn(`Asking ${platform} failed, trying again later: ${error.message}`);
        return false;
      }
      await this.fail(run.id, error.message, now);
      return true;
    }
    await this.complete(run, response.answer, contexts, new Date(), {
      costUsd: response.cost,
      operation: OPERATIONS[run.platform],
    });
    return true;
  }

  /** Removes live runs not asked yet; the next check creates them again. */
  private async dropUnasked(workspaceId: string): Promise<void> {
    await this.prisma.aiRun.deleteMany({
      where: { workspaceId, status: "PENDING", method: "llm_responses", postedAt: null },
    });
  }

  // ── Completing ────────────────────────────────────────────────────────────────────

  /**
   * Stores an answer (or its absence: the run still counts) with its mentions and citations.
   * Live answers are billed now and recorded in the ledger with the run.
   */
  private async complete(
    run: RunToComplete,
    answer: AiAnswer | null,
    contexts: AnalysisContexts,
    now: Date,
    live?: { costUsd: number; operation: string },
  ): Promise<void> {
    answer = answer ? withoutNul(answer) : null;
    for (let attempt = 0; ; attempt++) {
      const context = await contexts.get(run.projectId);
      const analysis = answer ? analyzeAnswer(answer, context) : null;
      try {
        await this.prisma.$transaction(async (tx) => {
          const { count } = await tx.aiRun.updateMany({
            where: { id: run.id, status: "PENDING" },
            data: {
              status: "COMPLETED",
              completedAt: now,
              answer: analysis?.text ?? null,
              answerHash: analysis?.hash ?? null,
              model: answer?.model ?? run.model,
              webSearch: answer?.webSearch ?? null,
              fanOutQueries: answer?.fanOutQueries ?? [],
              details: answer ? answerDetails(answer) : {},
              detectorVersion: MENTION_DETECTOR_VERSION,
              error: null,
              ...(live ? { costUsd: new Prisma.Decimal(live.costUsd) } : {}),
            },
          });
          if (count > 0 && analysis) {
            await tx.aiMention.createMany({
              data: analysis.mentions.map((mention) => ({ runId: run.id, ...mention })),
            });
            await tx.aiCitation.createMany({
              data: analysis.citations.map((citation) => ({ runId: run.id, ...citation })),
            });
          }
          if (live && live.costUsd > 0) {
            await this.usage.record(
              {
                workspaceId: run.workspaceId,
                projectId: count > 0 ? run.projectId : null,
                provider: "DATAFORSEO",
                operation: live.operation,
                units: 1,
                costUsd: live.costUsd,
              },
              tx,
            );
          }
        });
        return;
      } catch (error) {
        // A brand was deleted while the answer was analyzed: analyze again without it.
        if (attempt === 0 && isForeignKeyViolation(error)) {
          contexts.forget(run.projectId);
          continue;
        }
        throw error;
      }
    }
  }

  private async fail(runId: string, message: string, now: Date): Promise<void> {
    await this.prisma.aiRun.updateMany({
      where: { id: runId, status: "PENDING" },
      data: { status: "FAILED", completedAt: now, error: message.slice(0, 500) },
    });
  }

  private contexts(now: Date): AnalysisContexts {
    return new AnalysisContexts(async (projectId) => {
      const project = await this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        include: { brandEntities: true },
      });
      return analysisContext(project, project.brandEntities, await this.knownPages(projectId, now));
    });
  }

  /** Normalized URLs of the project's pages: the latest site audit and Search Console. */
  private async knownPages(projectId: string, now: Date): Promise<Set<string>> {
    const audit = await this.prisma.auditRun.findFirst({
      where: { projectId, status: "COMPLETED" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const since = addDays(now.toISOString().slice(0, 10), -SEARCH_CONSOLE_PAGE_DAYS);
    const [pages, searchConsole] = await Promise.all([
      audit
        ? this.prisma.auditPage.findMany({ where: { runId: audit.id }, select: { url: true } })
        : [],
      this.prisma.gscPageDaily.findMany({
        where: { projectId, date: { gte: asDate(since) } },
        distinct: ["page"],
        select: { page: true },
      }),
    ]);
    const known = new Set(pages.map((page) => page.url));
    for (const row of searchConsole) {
      const url = normalizeUrl(row.page);
      if (url) known.add(url);
    }
    return known;
  }

  // ── Sentiment ─────────────────────────────────────────────────────────────────────

  /**
   * Every five minutes, for projects that enabled it: classifies the tone of new brand
   * mentions with a small ChatGPT model, from the sentence around the first mention. A reply
   * that is not the requested JSON is stored as unclassified and not asked again.
   */
  async classifySentiment(signal?: AbortSignal, now = new Date()): Promise<void> {
    const deadline = Date.now() + LIVE_PASS_MS;
    const mentions = await this.prisma.aiMention.findMany({
      where: {
        classifierVersion: null,
        run: {
          status: "COMPLETED",
          completedAt: { gte: hoursAgo(now, SENTIMENT_WINDOW_HOURS) },
          project: { archivedAt: null, aiSettings: { is: { sentiment: true } } },
        },
      },
      orderBy: [{ runId: "asc" }, { entityId: "asc" }],
      take: SENTIMENT_BATCH,
      select: {
        runId: true,
        entityId: true,
        firstOffset: true,
        entity: { select: { name: true } },
        run: { select: { workspaceId: true, projectId: true, answer: true } },
      },
    });

    const byWorkspace = new Map<string, typeof mentions>();
    for (const mention of mentions) {
      const list = byWorkspace.get(mention.run.workspaceId) ?? [];
      list.push(mention);
      byWorkspace.set(mention.run.workspaceId, list);
    }

    for (const [workspaceId, list] of byWorkspace) {
      if (signal?.aborted || Date.now() > deadline) return;
      const client = await this.credentials.findDataForSeoClient(workspaceId);
      if (!client) continue;
      const model = await this.models.sentimentModel(client);
      if (!model) continue;
      const limit = await this.usage.blockingLimit(
        workspaceId,
        list.length * SENTIMENT_COST_PER_MENTION,
      );
      if (limit) {
        const project = await this.prisma.project.findUnique({
          where: { id: list[0]?.run.projectId ?? "" },
        });
        if (project) await this.notifyBudget(project, limit, now);
        continue;
      }

      let next = 0;
      let stop = false;
      const work = async () => {
        while (next < list.length && !stop && !signal?.aborted && Date.now() < deadline) {
          const mention = list[next++] as (typeof list)[number];
          try {
            if (!(await this.classifyOne(client, model, mention, now))) stop = true;
          } catch (error) {
            this.logger.warn(`Classifying a mention failed: ${String(error)}`);
          }
        }
      };
      await Promise.all(Array.from({ length: LIVE_CONCURRENCY }, work));
    }
  }

  /** Classifies one mention; `false` when the workspace cannot ask anything more now. */
  private async classifyOne(
    client: DataForSeoClient,
    model: string,
    mention: {
      runId: string;
      entityId: string;
      firstOffset: number;
      entity: { name: string };
      run: { workspaceId: string; projectId: string; answer: string | null };
    },
    now: Date,
  ): Promise<boolean> {
    const answer = mention.run.answer ?? "";
    const context = mentionContext(answer, {
      start: mention.firstOffset,
      end: mention.firstOffset + 1,
    });
    let reply: Awaited<ReturnType<typeof getLlmResponsesLive>>;
    try {
      reply = await getLlmResponsesLive(client, "chat_gpt", {
        prompt: sentimentPrompt(mention.entity.name, context),
        model,
        webSearch: false,
        tag: mention.runId,
      });
    } catch (error) {
      if (!(error instanceof DataForSeoError)) throw error;
      if (isAccountBlocking(error)) {
        await this.reportAccountProblem(mention.run.workspaceId, error, now);
        return false;
      }
      if (error.retryable) return false;
      reply = { answer: null, cost: 0 };
    }
    const sentiment = reply.answer ? parseSentiment(reply.answer.text) : null;
    await this.prisma.$transaction(async (tx) => {
      await tx.aiMention.updateMany({
        where: { runId: mention.runId, entityId: mention.entityId },
        data: {
          sentiment: sentiment?.sentiment ?? null,
          sentimentConfidence: sentiment?.confidence ?? null,
          classifierVersion: SENTIMENT_CLASSIFIER_VERSION,
        },
      });
      if (reply.cost > 0) {
        await this.usage.record(
          {
            workspaceId: mention.run.workspaceId,
            projectId: mention.run.projectId,
            provider: "DATAFORSEO",
            operation: SENTIMENT_OPERATION,
            units: 1,
            costUsd: reply.cost,
          },
          tx,
        );
      }
    });
    return true;
  }

  // ── Notices ───────────────────────────────────────────────────────────────────────

  private async notifyBudget(project: Project, limit: Prisma.Decimal, now: Date): Promise<void> {
    await this.notifications.notifyRolesOnce(
      project.workspaceId,
      ["owner", "admin"],
      {
        type: "ai.budget_blocked",
        title: "AI visibility checks are paused: the monthly budget is reached",
        body: `Raise the budget of $${limit.toFixed(2)} to resume asking AI platforms.`,
        data: { project: project.name, limitUsd: limit.toNumber() },
      },
      hoursAgo(now, 24),
    );
  }

  private async reportAccountProblem(
    workspaceId: string,
    error: DataForSeoError,
    now: Date,
  ): Promise<void> {
    if (!isAccountBlocking(error)) return;
    await this.notifications.notifyRolesOnce(
      workspaceId,
      ["owner", "admin"],
      {
        type: "dataforseo.account_blocked",
        title: "DataForSEO refused requests",
        body: error.message,
        data: { code: error.statusCode ?? null },
      },
      hoursAgo(now, 24),
    );
  }
}

function isAccountBlocking(error: DataForSeoError): boolean {
  return error.statusCode !== undefined && ACCOUNT_BLOCKING_CODES.has(error.statusCode);
}

function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
