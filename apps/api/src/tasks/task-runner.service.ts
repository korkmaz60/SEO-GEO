import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Prisma } from "@seo-geo/db";
import type { JobWithMetadata } from "pg-boss";

import { PrismaService } from "../database/prisma.service.js";
import { QueueService } from "./queue.service.js";
import { TaskRegistry, type TaskDefinition } from "./task-registry.js";

/** How often idle workers look for jobs, in seconds (pg-boss minimum: 0.5). */
export const TASK_POLLING_SECONDS = Symbol("TASK_POLLING_SECONDS");

const DEFAULT_TASK_QUEUE = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 60 * 60,
} as const;

interface TaskJobData {
  taskId: string;
}

/**
 * Runs in the worker: subscribes to every registered task type and scheduled job, and keeps
 * the `task` rows in step with the jobs (running → succeeded / failed, progress, cost).
 */
@Injectable()
export class TaskRunner implements OnApplicationBootstrap {
  private readonly logger = new Logger("Tasks");

  constructor(
    private readonly queue: QueueService,
    private readonly registry: TaskRegistry,
    private readonly prisma: PrismaService,
    @Inject(TASK_POLLING_SECONDS) private readonly pollingIntervalSeconds: number,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const boss = await this.queue.instance();

    for (const [type, definition] of this.registry.tasks) {
      await this.queue.ensureQueue(type, { ...DEFAULT_TASK_QUEUE, ...definition.queue });
      await boss.work(
        type,
        { includeMetadata: true, pollingIntervalSeconds: this.pollingIntervalSeconds },
        async (jobs: JobWithMetadata<TaskJobData>[]) => {
          for (const job of jobs) await this.run(job, definition);
        },
      );
    }

    for (const job of this.registry.scheduled.values()) {
      await this.queue.ensureQueue(job.name, { retryLimit: 1, expireInSeconds: 60 * 60 });
      await boss.schedule(job.name, job.cron, null, { tz: "UTC" });
      await boss.work(
        job.name,
        { pollingIntervalSeconds: this.pollingIntervalSeconds },
        async (jobs) => {
          for (const scheduled of jobs) await job.handler(scheduled.signal);
        },
      );
    }

    this.logger.log(
      `Listening for ${this.registry.tasks.size} task types and ${this.registry.scheduled.size} scheduled jobs`,
    );
  }

  private async run(job: JobWithMetadata<TaskJobData>, definition: TaskDefinition): Promise<void> {
    const task = await this.prisma.task.findUnique({ where: { id: job.data.taskId } });
    if (!task || task.status === "canceled" || task.status === "succeeded") return;

    await this.prisma.task.update({
      where: { id: task.id },
      data: { status: "running", startedAt: task.startedAt ?? new Date(), error: Prisma.DbNull },
    });

    try {
      const outcome = await definition.handler({
        taskId: task.id,
        workspaceId: task.workspaceId,
        projectId: task.projectId,
        input: task.input,
        signal: job.signal,
        progress: async (percent) => {
          await this.prisma.task.update({
            where: { id: task.id },
            data: { progress: Math.max(0, Math.min(100, Math.round(percent))) },
          });
        },
      });
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: "succeeded",
          progress: 100,
          finishedAt: new Date(),
          result: outcome?.result ?? Prisma.DbNull,
          actualCostUsd: new Prisma.Decimal(outcome?.costUsd ?? 0),
        },
      });
    } catch (error) {
      const finalAttempt = job.retryCount >= job.retryLimit;
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: finalAttempt ? "failed" : "queued",
          finishedAt: finalAttempt ? new Date() : null,
          error: { code: "task_failed", message: message.slice(0, 1000) },
        },
      });
      if (finalAttempt) this.logger.warn(`Task ${task.type} ${task.id} failed: ${message}`);
      throw error;
    }
  }
}
