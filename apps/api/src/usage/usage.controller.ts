import { Body, Controller, Delete, Get, HttpCode, Put, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  MonthSchema,
  UpdateBudgetSchema,
  UsageSummarySchema,
  type UpdateBudget,
  type UsageSummary,
} from "@seo-geo/contracts";
import { Prisma } from "@seo-geo/db";
import { z } from "zod";

import { AuditService } from "../audit/audit.service.js";
import { CurrentWorkspace, RequireRole, SessionOnly, WorkspaceScoped } from "../auth/decorators.js";
import type { WorkspaceContext } from "../auth/principal.js";
import { toOpenApiSchema } from "../common/openapi.js";
import { Meta, type RequestMeta } from "../common/request-meta.js";
import { ZodValidationPipe } from "../common/zod-validation.pipe.js";
import { PrismaService } from "../database/prisma.service.js";
import { UsageService, currentMonth } from "./usage.service.js";

const UsageQuerySchema = z.strictObject({ month: MonthSchema.optional() });

@ApiTags("usage")
@WorkspaceScoped()
@Controller("workspaces/:workspaceId")
export class UsageController {
  constructor(
    private readonly usage: UsageService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get("usage")
  @ApiOperation({ summary: "Provider spend for a month (UTC), by provider, with the budget" })
  @ApiOkResponse({ schema: toOpenApiSchema(UsageSummarySchema) })
  summary(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query(new ZodValidationPipe(UsageQuerySchema)) query: z.output<typeof UsageQuerySchema>,
  ): Promise<UsageSummary> {
    return this.usage.summary(workspace.id, query.month ?? currentMonth());
  }

  @Put("budget")
  @SessionOnly()
  @RequireRole("admin")
  @ApiOperation({ summary: "Set the monthly provider budget" })
  async setBudget(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body(new ZodValidationPipe(UpdateBudgetSchema)) body: UpdateBudget,
    @Meta() meta: RequestMeta,
  ): Promise<UsageSummary> {
    const data = {
      monthlyLimitUsd: new Prisma.Decimal(body.monthlyLimitUsd),
      hardStop: body.hardStop,
      alertThresholds: body.alertThresholds,
    };
    await this.prisma.budget.upsert({
      where: { workspaceId: workspace.id },
      create: { workspaceId: workspace.id, ...data },
      update: data,
    });
    await this.audit.record({
      workspaceId: workspace.id,
      action: "budget.updated",
      metadata: { ...body },
      meta,
    });
    return this.usage.summary(workspace.id, currentMonth());
  }

  @Delete("budget")
  @SessionOnly()
  @HttpCode(204)
  @RequireRole("admin")
  @ApiOperation({ summary: "Remove the monthly provider budget" })
  async deleteBudget(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const { count } = await this.prisma.budget.deleteMany({ where: { workspaceId: workspace.id } });
    if (count > 0) {
      await this.audit.record({ workspaceId: workspace.id, action: "budget.removed", meta });
    }
  }
}
