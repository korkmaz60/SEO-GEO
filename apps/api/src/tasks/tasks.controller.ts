import { Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { TaskListQuerySchema, TaskSchema, type Task, type TaskListQuery } from "@seo-geo/contracts";
import { z } from "zod";

import { CurrentWorkspace, RequireRole, WorkspaceScoped } from "../auth/decorators.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { IdParam } from "../common/params.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { TaskService, toTask } from "./task.service.js";

@ApiTags("tasks")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId/tasks")
export class TasksController {
  constructor(private readonly tasks: TaskService) {}

  @Get()
  @ApiOperation({ summary: "Recent background tasks, newest first" })
  @ApiOkResponse({ schema: toOpenApiSchema(z.object({ data: z.array(TaskSchema) })) })
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(TaskListQuerySchema)) query: TaskListQuery,
  ): Promise<{ data: Task[] }> {
    const rows = await this.tasks.list(workspace.id, { status: query.status, limit: query.limit });
    return { data: rows.map(toTask) };
  }

  @Get(":taskId")
  @ApiOperation({ summary: "A task's status, progress and result" })
  @ApiOkResponse({ schema: toOpenApiSchema(TaskSchema) })
  async get(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("taskId", "Task") taskId: string,
  ): Promise<Task> {
    return toTask(await this.tasks.get(workspace.id, taskId));
  }

  @Post(":taskId/cancel")
  @HttpCode(200)
  @RequireRole("member")
  @ApiOperation({ summary: "Cancel a task that has not started" })
  @ApiOkResponse({ schema: toOpenApiSchema(TaskSchema) })
  async cancel(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @IdParam("taskId", "Task") taskId: string,
  ): Promise<Task> {
    return toTask(await this.tasks.cancel(workspace.id, taskId));
  }
}
