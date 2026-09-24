import { HttpStatus, Injectable } from "@nestjs/common";
import { ErrorCode, type Provider, type UsageSummary } from "@seo-geo/contracts";
import { Prisma } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { money } from "../common/serialize.js";
import { PrismaService } from "../database/prisma.service.js";
import { NotificationsService } from "../notifications/notifications.service.js";

export interface UsageInput {
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
  provider: Provider;
  /** e.g. `serp.google.organic`, `keywords.search_volume`. */
  operation: string;
  units?: number;
  /** Cost in USD as reported by the provider. */
  costUsd: string | number;
  billedTo?: "WORKSPACE" | "PLATFORM";
}

/** First instant of the UTC month containing `date`, and of the following month. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [year, monthIndex] = month.split("-").map(Number) as [number, number];
  return {
    start: new Date(Date.UTC(year, monthIndex - 1, 1)),
    end: new Date(Date.UTC(year, monthIndex, 1)),
  };
}

export function currentMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The usage ledger and the workspace budget. */
@Injectable()
export class UsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Appends a ledger entry and notifies owners and admins when a budget threshold is crossed. */
  async record(input: UsageInput, db: Prisma.TransactionClient = this.prisma): Promise<void> {
    const cost = new Prisma.Decimal(input.costUsd);
    const { start, end } = monthRange(currentMonth());
    const before = await this.spent(input.workspaceId, start, end, db);

    await db.usageEntry.create({
      data: {
        workspaceId: input.workspaceId,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        provider: input.provider,
        operation: input.operation,
        units: input.units ?? 1,
        costUsd: cost,
        billedTo: input.billedTo ?? "WORKSPACE",
      },
    });

    const budget = await db.budget.findUnique({ where: { workspaceId: input.workspaceId } });
    if (!budget || cost.isZero()) return;
    const after = before.plus(cost);
    const crossed = budget.alertThresholds.filter((percent) => {
      const line = budget.monthlyLimitUsd.times(percent).dividedBy(100);
      return before.lessThan(line) && after.greaterThanOrEqualTo(line);
    });
    if (crossed.length > 0) {
      const highest = Math.max(...crossed);
      await this.notifications.notifyRoles(
        input.workspaceId,
        ["owner", "admin"],
        {
          type: "budget.threshold",
          title: `Provider spend reached ${highest}% of the monthly budget`,
          body: `$${after.toFixed(2)} of $${budget.monthlyLimitUsd.toFixed(2)} this month.`,
          data: {
            percent: highest,
            spentUsd: after.toNumber(),
            limitUsd: budget.monthlyLimitUsd.toNumber(),
          },
        },
        db,
      );
    }
  }

  /**
   * Throws `budget_exceeded` (402) when the estimated cost of paid work would take the
   * workspace over a hard-stop budget this month.
   */
  async assertCanSpend(workspaceId: string, estimatedUsd: string | number): Promise<void> {
    const limit = await this.blockingLimit(workspaceId, estimatedUsd);
    if (limit) {
      throw new ProblemException({
        status: HttpStatus.PAYMENT_REQUIRED,
        code: ErrorCode.BudgetExceeded,
        detail: `This would exceed the monthly budget of $${limit.toFixed(2)}.`,
      });
    }
  }

  /**
   * The monthly limit of a hard-stop budget that the estimated cost would exceed, or `null`
   * when the work may run. For background jobs, which skip work instead of failing.
   */
  async blockingLimit(
    workspaceId: string,
    estimatedUsd: string | number,
  ): Promise<Prisma.Decimal | null> {
    const budget = await this.prisma.budget.findUnique({ where: { workspaceId } });
    if (!budget?.hardStop) return null;
    const { start, end } = monthRange(currentMonth());
    const projected = (await this.spent(workspaceId, start, end)).plus(estimatedUsd);
    return projected.greaterThan(budget.monthlyLimitUsd) ? budget.monthlyLimitUsd : null;
  }

  async summary(workspaceId: string, month: string): Promise<UsageSummary> {
    const { start, end } = monthRange(month);
    const [groups, budget] = await Promise.all([
      this.prisma.usageEntry.groupBy({
        by: ["provider"],
        where: { workspaceId, createdAt: { gte: start, lt: end } },
        _sum: { costUsd: true },
        _count: { _all: true },
        orderBy: { provider: "asc" },
      }),
      this.prisma.budget.findUnique({ where: { workspaceId } }),
    ]);
    const total = groups.reduce(
      (sum, group) => sum.plus(group._sum.costUsd ?? 0),
      new Prisma.Decimal(0),
    );

    return {
      month,
      totalUsd: total.toNumber(),
      byProvider: groups.map((group) => ({
        provider: group.provider,
        costUsd: money(group._sum.costUsd ?? new Prisma.Decimal(0)),
        operations: group._count._all,
      })),
      budget: budget
        ? {
            monthlyLimitUsd: money(budget.monthlyLimitUsd),
            hardStop: budget.hardStop,
            alertThresholds: budget.alertThresholds,
          }
        : null,
      budgetUsedPercent: budget
        ? total.dividedBy(budget.monthlyLimitUsd).times(100).toDecimalPlaces(1).toNumber()
        : null,
    };
  }

  private async spent(
    workspaceId: string,
    start: Date,
    end: Date,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Prisma.Decimal> {
    const result = await db.usageEntry.aggregate({
      where: { workspaceId, createdAt: { gte: start, lt: end } },
      _sum: { costUsd: true },
    });
    return result._sum.costUsd ?? new Prisma.Decimal(0);
  }
}
