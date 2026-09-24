import { createHash } from "node:crypto";

import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { Provider } from "@seo-geo/contracts";
import { Prisma } from "@seo-geo/db";
import type { z } from "zod";

import { PrismaService } from "../database/prisma.service.js";
import { TaskRegistry } from "../tasks/task-registry.js";

export interface CachedValue<T> {
  value: T;
  fetchedAt: Date;
  costUsd: number;
}

/** JSON with object keys sorted, so equal parameters always hash the same. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function cacheKey(operation: string, params: object): string {
  return createHash("sha256")
    .update(`${operation}\n${canonicalJson(params)}`)
    .digest("hex");
}

/**
 * Provider responses shared by all workspaces (`provider_cache`): public market data only,
 * keyed by a versioned operation name and normalized parameters.
 */
@Injectable()
export class ProviderCacheService implements OnModuleInit {
  private readonly logger = new Logger("ProviderCache");

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: TaskRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerScheduledJob({
      name: "maintenance.provider-cache",
      cron: "25 4 * * *",
      handler: () => this.purgeExpired().then(() => undefined),
    });
  }

  /** A fresh cached value; entries that no longer match the schema count as missing. */
  async get<T extends z.ZodType>(
    operation: string,
    params: object,
    schema: T,
    now = new Date(),
  ): Promise<CachedValue<z.infer<T>> | null> {
    const row = await this.prisma.providerCache.findUnique({
      where: { key: cacheKey(operation, params) },
    });
    if (!row || row.expiresAt <= now) return null;
    const parsed = schema.safeParse(row.response);
    if (!parsed.success) {
      this.logger.warn(`Ignoring a cached ${operation} entry with an outdated shape`);
      return null;
    }
    return { value: parsed.data, fetchedAt: row.fetchedAt, costUsd: row.costUsd.toNumber() };
  }

  async has(operation: string, params: object, now = new Date()): Promise<boolean> {
    const row = await this.prisma.providerCache.findUnique({
      where: { key: cacheKey(operation, params) },
      select: { expiresAt: true },
    });
    return row !== null && row.expiresAt > now;
  }

  async set(
    input: {
      provider: Provider;
      operation: string;
      params: object;
      value: Prisma.InputJsonValue;
      costUsd: number;
      ttlDays: number;
    },
    now = new Date(),
  ): Promise<void> {
    const key = cacheKey(input.operation, input.params);
    const data = {
      provider: input.provider,
      operation: input.operation,
      params: JSON.parse(canonicalJson(input.params)) as Prisma.InputJsonValue,
      response: input.value,
      costUsd: new Prisma.Decimal(input.costUsd),
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + input.ttlDays * 86_400_000),
    };
    await this.prisma.providerCache.upsert({
      where: { key },
      create: { key, ...data },
      update: data,
    });
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const { count } = await this.prisma.providerCache.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return count;
  }
}
