import { HttpStatus, Injectable } from "@nestjs/common";
import { ErrorCode, type Task, type TaskStatus } from "@seo-geo/contracts";
import { Prisma, type Task as TaskRow } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { iso, money } from "../common/serialize.js";
import { PrismaService } from "../database/prisma.service.js";
import { QueueService } from "./queue.service.js";

export interface CreateTaskInput {
  workspaceId: string;
  projectId?: string | null;
  type: string;
  input?: Prisma.InputJsonValue;
  /** Replays with the same key return the original task. */
  idempotencyKey?: string | null;
  createdBy?: string | null;
  estimatedCostUsd?: string | number | null;
}

export function toTask(row: TaskRow): Task {
  const error = row.error as { code?: unknown; message?: unknown } | null;
  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    status: row.status,
    progress: row.progress,
    result: row.result ?? null,
    error:
      error && typeof error.message === "string"
        ? { code: typeof error.code === "string" ? error.code : "error", message: error.message }
        : null,
    estimatedCostUsd: money(row.estimatedCostUsd),
    actualCostUsd: money(row.actualCostUsd),
    createdAt: iso(row.createdAt),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
  };
}

/** User-visible background operations: a `task` row plus a pg-boss job carrying its ID. */
@Injectable()
export class TaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async create(input: CreateTaskInput): Promise<{ task: TaskRow; created: boolean }> {
    const key = input.idempotencyKey ?? null;
    if (key) {
      const existing = await this.findByKey(input.workspaceId, key);
      if (existing) return { task: existing, created: false };
    }

    let task: TaskRow;
    try {
      task = await this.prisma.task.create({
        data: {
          workspaceId: input.workspaceId,
          projectId: input.projectId ?? null,
          type: input.type,
          input: input.input ?? {},
          idempotencyKey: key,
          createdBy: input.createdBy ?? null,
          estimatedCostUsd:
            input.estimatedCostUsd == null ? null : new Prisma.Decimal(input.estimatedCostUsd),
        },
      });
    } catch (error) {
      // A concurrent request with the same idempotency key won the race.
      if (key && isUniqueViolation(error)) {
        const existing = await this.findByKey(input.workspaceId, key);
        if (existing) return { task: existing, created: false };
      }
      throw error;
    }

    try {
      await this.queue.send(input.type, { taskId: task.id }, { singletonKey: task.id });
    } catch (error) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: { code: "queue_unavailable", message: "The task could not be queued." },
        },
      });
      throw error;
    }
    return { task, created: true };
  }

  async get(workspaceId: string, taskId: string): Promise<TaskRow> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, workspaceId } });
    if (!task) throw ProblemException.notFound("Task not found.");
    return task;
  }

  list(workspaceId: string, options: { status?: TaskStatus[]; limit: number }): Promise<TaskRow[]> {
    return this.prisma.task.findMany({
      where: { workspaceId, ...(options.status ? { status: { in: options.status } } : {}) },
      orderBy: { createdAt: "desc" },
      take: options.limit,
    });
  }

  /** Cancels a task that has not started yet. */
  async cancel(workspaceId: string, taskId: string): Promise<TaskRow> {
    const { count } = await this.prisma.task.updateMany({
      where: { id: taskId, workspaceId, status: "queued" },
      data: { status: "canceled", finishedAt: new Date() },
    });
    const task = await this.get(workspaceId, taskId);
    if (count === 0 && task.status !== "canceled") {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: `A ${task.status} task cannot be canceled.`,
      });
    }
    return task;
  }

  private findByKey(workspaceId: string, idempotencyKey: string): Promise<TaskRow | null> {
    return this.prisma.task.findUnique({
      where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey } },
    });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
