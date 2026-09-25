import { Injectable } from "@nestjs/common";
import { roundUsd, type DataForSeoClient } from "@seo-geo/dataforseo";
import type { Prisma } from "@seo-geo/db";
import type { z } from "zod";

import { CredentialsService } from "../credentials/credentials.service.js";
import { UsageService } from "../usage/usage.service.js";
import { ProviderCacheService } from "./provider-cache.service.js";
import { providerProblem } from "./provider-errors.js";

/** Domain and backlink data stay cached for 7 days (D23). */
export const PROVIDER_DATA_TTL_DAYS = 7;

/** One cached DataForSEO request that a view is made of. */
export interface ProviderPart<T> {
  /** Versioned cache operation, e.g. `backlinks.summary@1`; bump it when `T` changes. */
  operation: string;
  /** Normalized request parameters; they key the cache. */
  params: object;
  /** Validates cached values; entries that no longer match count as missing. */
  schema: z.ZodType<T>;
  /** Upper bound in USD of what the request costs, for quotes and the budget check. */
  estimateUsd: number;
  fetch: (client: DataForSeoClient) => Promise<{ value: T; cost: number; units: number }>;
}

export interface LoadedPart<T> {
  value: T;
  fetchedAt: Date;
  cached: boolean;
  /** What loading it cost now; 0 from the cache. */
  costUsd: number;
}

export type PartMap = Record<string, ProviderPart<unknown>>;
type PartValue<P> = P extends ProviderPart<infer T> ? T : never;
export type LoadedParts<P extends PartMap> = { [K in keyof P]: LoadedPart<PartValue<P[K]>> };
export type CachedParts<P extends PartMap> = {
  [K in keyof P]: LoadedPart<PartValue<P[K]>> | null;
};

export interface LoadOptions {
  /** Load every part again, even the cached ones (D23). */
  refresh?: boolean;
  /** Recorded with the costs in the usage ledger. */
  projectId?: string;
  now?: Date;
}

/** Upper bound in USD of loading these parts. */
export function estimateParts(parts: readonly ProviderPart<unknown>[]): number {
  return roundUsd(parts.reduce((sum, part) => sum + part.estimateUsd, 0));
}

/**
 * Views made of cached DataForSEO requests (docs/backend.md, "Domain overview and
 * backlinks"): cached parts are free; the others are fetched after a budget check, cached for
 * every workspace and written to the usage ledger.
 */
@Injectable()
export class CachedPartsService {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly cache: ProviderCacheService,
    private readonly usage: UsageService,
  ) {}

  /** The fresh cached value of every part, `null` where there is none. Free. */
  async peek<P extends PartMap>(parts: P, now = new Date()): Promise<CachedParts<P>> {
    const keys = Object.keys(parts);
    const hits = await Promise.all(
      keys.map((key) => {
        const part = parts[key] as ProviderPart<unknown>;
        return this.cache.get(part.operation, part.params, part.schema, now);
      }),
    );
    return Object.fromEntries(
      keys.map((key, index) => {
        const hit = hits[index];
        return [
          key,
          hit ? { value: hit.value, fetchedAt: hit.fetchedAt, cached: true, costUsd: 0 } : null,
        ];
      }),
    ) as CachedParts<P>;
  }

  /** What loading would cost: the parts that are not cached, or all of them when refreshing. */
  async quote(
    parts: PartMap,
    options: { refresh?: boolean; now?: Date } = {},
  ): Promise<{ cached: boolean; estimatedCostUsd: number }> {
    const all = Object.values(parts);
    const cached = options.refresh
      ? all.map(() => false)
      : await Promise.all(
          all.map((part) => this.cache.has(part.operation, part.params, options.now)),
        );
    const missing = all.filter((_, index) => !cached[index]);
    return { cached: missing.length === 0, estimatedCostUsd: estimateParts(missing) };
  }

  /**
   * Every part: cached ones for free, the others (all of them when refreshing) from DataForSEO
   * once the budget covers their estimate. Parts that succeed are cached and billed even when
   * another fails, so trying again only pays for the rest.
   */
  async load<P extends PartMap>(
    workspaceId: string,
    parts: P,
    options: LoadOptions = {},
  ): Promise<LoadedParts<P>> {
    const now = options.now ?? new Date();
    const loaded: Record<string, LoadedPart<unknown> | null> = options.refresh
      ? {}
      : await this.peek(parts, now);
    const missing = Object.keys(parts).filter((key) => !loaded[key]);
    if (missing.length > 0) {
      const client = await this.credentials.dataForSeoClient(workspaceId);
      const pending = missing.map((key) => parts[key] as ProviderPart<unknown>);
      await this.usage.assertCanSpend(workspaceId, estimateParts(pending));
      const results = await Promise.allSettled(pending.map((part) => part.fetch(client)));
      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") continue;
        const part = pending[index] as ProviderPart<unknown>;
        await this.cache.set(
          {
            provider: "DATAFORSEO",
            operation: part.operation,
            params: part.params,
            value: result.value.value as Prisma.InputJsonValue,
            costUsd: result.value.cost,
            ttlDays: PROVIDER_DATA_TTL_DAYS,
          },
          now,
        );
        await this.usage.record({
          workspaceId,
          projectId: options.projectId ?? null,
          provider: "DATAFORSEO",
          operation: part.operation.split("@")[0] as string,
          units: result.value.units,
          costUsd: result.value.cost,
        });
        loaded[missing[index] as string] = {
          value: result.value.value,
          fetchedAt: now,
          cached: false,
          costUsd: result.value.cost,
        };
      }
      const failure = results.find((result) => result.status === "rejected");
      if (failure) throw providerProblem((failure as PromiseRejectedResult).reason);
    }
    return loaded as LoadedParts<P>;
  }
}

/** When a view's data was fetched (its oldest part) and whether it all came from the cache. */
export function sourceOf(parts: readonly LoadedPart<unknown>[]): {
  fetchedAt: string;
  cached: boolean;
} {
  return {
    fetchedAt: new Date(Math.min(...parts.map((part) => part.fetchedAt.getTime()))).toISOString(),
    cached: parts.every((part) => part.cached),
  };
}

/** What loading a view's parts cost this time. */
export function costOf(parts: readonly LoadedPart<unknown>[]): number {
  return roundUsd(parts.reduce((sum, part) => sum + part.costUsd, 0));
}
