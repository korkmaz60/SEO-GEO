import { Injectable } from "@nestjs/common";
import type { Prisma } from "@seo-geo/db";

import type { QueueOptions } from "./queue.service.js";

export interface TaskContext {
  taskId: string;
  workspaceId: string;
  projectId: string | null;
  input: Prisma.JsonValue;
  /** Aborted when the job expires or the worker shuts down. */
  signal: AbortSignal;
  /** Reports progress (0–100) on the task row. */
  progress(percent: number): Promise<void>;
}

export interface TaskOutcome {
  result?: Prisma.InputJsonValue;
  /** Provider cost of this run; the handler records ledger entries itself. */
  costUsd?: string | number;
}

export type TaskHandler = (context: TaskContext) => Promise<TaskOutcome | void>;

export interface TaskDefinition {
  handler: TaskHandler;
  queue?: QueueOptions;
}

export interface ScheduledJob {
  /** Queue name, e.g. `credentials.reverify`. */
  name: string;
  /** Cron expression in UTC. */
  cron: string;
  handler: (signal: AbortSignal) => Promise<void>;
  queue?: QueueOptions;
}

/**
 * Internal background work that is not shown to users as a task, e.g. collecting SERPs.
 * Enqueued with `QueueService.send(name, data)`.
 */
export interface BackgroundJob<TData extends object = object> {
  /** Queue name, e.g. `rank.check`. */
  name: string;
  handler: (data: TData, signal: AbortSignal) => Promise<void>;
  queue?: QueueOptions;
}

const DEFAULT_TASK_QUEUE: QueueOptions = {
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 60 * 60,
};

const DEFAULT_JOB_QUEUE: QueueOptions = {
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 30 * 60,
};

const DEFAULT_SCHEDULED_QUEUE: QueueOptions = { retryLimit: 1, expireInSeconds: 60 * 60 };

/**
 * Task types, background jobs and scheduled jobs, registered by feature modules in
 * `onModuleInit`. The worker subscribes to all of them; the api only enqueues.
 */
@Injectable()
export class TaskRegistry {
  readonly tasks = new Map<string, TaskDefinition>();
  readonly scheduled = new Map<string, ScheduledJob>();
  readonly jobs = new Map<string, BackgroundJob>();

  registerTask(type: string, definition: TaskDefinition): void {
    if (this.tasks.has(type)) throw new Error(`Task type ${type} is registered twice`);
    this.tasks.set(type, definition);
  }

  registerScheduledJob(job: ScheduledJob): void {
    if (this.scheduled.has(job.name)) throw new Error(`Job ${job.name} is registered twice`);
    this.scheduled.set(job.name, job);
  }

  registerJob<TData extends object>(job: BackgroundJob<TData>): void {
    if (this.jobs.has(job.name)) throw new Error(`Job ${job.name} is registered twice`);
    this.jobs.set(job.name, job as unknown as BackgroundJob);
  }

  /**
   * Options of a queue. A queue keeps the options it was created with, so every process
   * creates it with these, whether the worker subscribes first or the api enqueues first.
   */
  queueOptions(name: string): QueueOptions {
    const task = this.tasks.get(name);
    if (task) return { ...DEFAULT_TASK_QUEUE, ...task.queue };
    const job = this.jobs.get(name);
    if (job) return { ...DEFAULT_JOB_QUEUE, ...job.queue };
    const scheduled = this.scheduled.get(name);
    if (scheduled) return { ...DEFAULT_SCHEDULED_QUEUE, ...scheduled.queue };
    return {};
  }
}
