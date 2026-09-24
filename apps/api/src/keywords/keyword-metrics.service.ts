import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import type { KeywordMetrics } from "@seo-geo/contracts";
import {
  DataForSeoError,
  LABS_LIMITS,
  SEARCH_INTENTS,
  estimateLabsCost,
  getKeywordOverview,
  type KeywordData,
} from "@seo-geo/dataforseo";
import { normalizeKeyword } from "@seo-geo/core";
import { Prisma, type KeywordMetric } from "@seo-geo/db";

import { CredentialsService } from "../credentials/credentials.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { QueueService } from "../tasks/queue.service.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { UsageService } from "../usage/usage.service.js";

/** Keyword metrics are refreshed when older than this. */
export const KEYWORD_METRICS_TTL_DAYS = 30;
export const ENRICH_JOB = "keywords.enrich";

export interface Market {
  locationCode: number;
  languageCode: string;
}

export interface EnrichJobData extends Market {
  workspaceId: string;
  projectId: string | null;
  keywords: string[];
}

type Intent = (typeof SEARCH_INTENTS)[number];

function isIntent(value: string | null): value is Intent {
  return value !== null && (SEARCH_INTENTS as readonly string[]).includes(value);
}

export function toKeywordMetrics(row: KeywordMetric): KeywordMetrics {
  return {
    searchVolume: row.searchVolume,
    keywordDifficulty: row.keywordDifficulty,
    cpc: row.cpc,
    intent: isIntent(row.intent) ? row.intent : null,
    fetchedAt: row.fetchedAt.toISOString(),
  };
}

/** Map key of a keyword in a market. */
export function metricKey(keyword: string, market: Market): string {
  return `${market.locationCode}|${market.languageCode}|${keyword}`;
}

/**
 * Search volume, difficulty, CPC and intent per keyword and market: shared market data in
 * `keyword_metric`, filled from keyword research results and refreshed with DataForSEO Labs
 * keyword overview.
 */
@Injectable()
export class KeywordMetricsService implements OnModuleInit {
  private readonly logger = new Logger("KeywordMetrics");

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly usage: UsageService,
    private readonly queue: QueueService,
    private readonly registry: TaskRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerJob<EnrichJobData>({
      name: ENRICH_JOB,
      handler: (data) => this.enrich(data),
    });
  }

  /** Stored metrics of these keywords, keyed by {@link metricKey}. */
  async lookup(
    entries: readonly ({ keyword: string } & Market)[],
  ): Promise<Map<string, KeywordMetric>> {
    if (entries.length === 0) return new Map();
    const rows = await this.prisma.keywordMetric.findMany({
      where: {
        OR: entries.map((entry) => ({
          keyword: entry.keyword,
          locationCode: entry.locationCode,
          languageCode: entry.languageCode,
        })),
      },
    });
    return new Map(rows.map((row) => [metricKey(row.keyword, row), row]));
  }

  /** Keywords of a market with no metrics or metrics older than the TTL. */
  async stale(market: Market, keywords: readonly string[], now = new Date()): Promise<string[]> {
    if (keywords.length === 0) return [];
    const fresh = await this.prisma.keywordMetric.findMany({
      where: {
        locationCode: market.locationCode,
        languageCode: market.languageCode,
        keyword: { in: [...keywords] },
        fetchedAt: { gte: new Date(now.getTime() - KEYWORD_METRICS_TTL_DAYS * 86_400_000) },
      },
      select: { keyword: true },
    });
    const known = new Set(fresh.map((row) => row.keyword));
    return [...new Set(keywords)].filter((keyword) => !known.has(keyword));
  }

  /** Upper-bound cost of fetching metrics for `count` keywords. */
  estimate(count: number): number {
    if (count === 0) return 0;
    return estimateLabsCost({
      items: count,
      requests: Math.ceil(count / LABS_LIMITS.overviewKeywords),
    });
  }

  /** Queues a metrics refresh for the keywords that need one. */
  async requestEnrichment(data: EnrichJobData): Promise<void> {
    const stale = await this.stale(data, data.keywords);
    for (let index = 0; index < stale.length; index += LABS_LIMITS.overviewKeywords) {
      await this.queue.send(ENRICH_JOB, {
        ...data,
        keywords: stale.slice(index, index + LABS_LIMITS.overviewKeywords),
      });
    }
  }

  /** Fetches and stores metrics for keywords whose data is missing or old. */
  async enrich(data: EnrichJobData): Promise<void> {
    const keywords = (await this.stale(data, data.keywords)).slice(0, LABS_LIMITS.overviewKeywords);
    if (keywords.length === 0) return;
    const client = await this.credentials.findDataForSeoClient(data.workspaceId);
    if (!client) return;
    if (await this.usage.blockingLimit(data.workspaceId, this.estimate(keywords.length))) {
      this.logger.log(`Skipped metrics for ${keywords.length} keywords: budget reached`);
      return;
    }

    let result: Awaited<ReturnType<typeof getKeywordOverview>>;
    try {
      result = await getKeywordOverview(client, {
        keywords,
        locationCode: data.locationCode,
        languageCode: data.languageCode,
      });
    } catch (error) {
      // Refused requests (bad market, no funds) are not retried; the next add retries.
      if (error instanceof DataForSeoError && !error.retryable) {
        this.logger.warn(`Keyword overview failed: ${error.message}`);
        return;
      }
      throw error;
    }

    const now = new Date();
    const found = new Set(
      result.items.map((item) => normalizeKeyword(item.keyword, data.languageCode)),
    );
    // Keywords without data are stored empty so they are not requested again every time.
    const empty = keywords.filter((keyword) => !found.has(keyword));
    await this.prisma.$transaction(async (tx) => {
      await this.store(data, result.items, now, tx);
      await this.storeEmpty(data, empty, now, tx);
      await this.usage.record(
        {
          workspaceId: data.workspaceId,
          projectId: data.projectId,
          provider: "DATAFORSEO",
          operation: "labs.keyword_overview",
          units: result.items.length,
          costUsd: result.cost,
        },
        tx,
      );
    });
  }

  /** Upserts metrics from any DataForSEO Labs result (research results fill the cache too). */
  async store(
    market: Market,
    items: readonly KeywordData[],
    fetchedAt = new Date(),
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if (items.length === 0) return;
    // Normalized like tracked keywords; a keyword listed twice is stored once.
    const unique = new Map(
      items.map((item) => [normalizeKeyword(item.keyword, market.languageCode), item]),
    );
    const rows = [...unique].map(([keyword, item]) => ({
      keyword,
      location_code: market.locationCode,
      language_code: market.languageCode,
      search_volume: item.searchVolume,
      cpc: item.cpc,
      competition: item.competition,
      competition_level: item.competitionLevel,
      keyword_difficulty:
        item.keywordDifficulty === null ? null : Math.round(item.keywordDifficulty),
      intent: item.intent,
      secondary_intents: item.secondaryIntents,
      monthly_searches: item.monthlySearches,
      fetched_at: fetchedAt.toISOString(),
    }));
    await this.upsert(rows, db);
  }

  private async storeEmpty(
    market: Market,
    keywords: readonly string[],
    fetchedAt: Date,
    db: Prisma.TransactionClient,
  ): Promise<void> {
    if (keywords.length === 0) return;
    await this.upsert(
      keywords.map((keyword) => ({
        keyword,
        location_code: market.locationCode,
        language_code: market.languageCode,
        search_volume: null,
        cpc: null,
        competition: null,
        competition_level: null,
        keyword_difficulty: null,
        intent: null,
        secondary_intents: [],
        monthly_searches: [],
        fetched_at: fetchedAt.toISOString(),
      })),
      db,
    );
  }

  private async upsert(rows: object[], db: Prisma.TransactionClient): Promise<void> {
    // One statement for the whole batch; the JSON is expanded into typed rows.
    await db.$executeRaw`
      INSERT INTO keyword_metric (
        keyword, location_code, language_code, search_volume, cpc, competition,
        competition_level, keyword_difficulty, intent, secondary_intents, monthly_searches,
        source, fetched_at
      )
      SELECT keyword, location_code, language_code, search_volume, cpc, competition,
        competition_level, keyword_difficulty, intent, secondary_intents, monthly_searches,
        'dataforseo_labs', fetched_at
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS x(
        keyword text, location_code int, language_code text, search_volume int, cpc float8,
        competition float8, competition_level text, keyword_difficulty int, intent text,
        secondary_intents text[], monthly_searches jsonb, fetched_at timestamptz
      )
      ON CONFLICT (keyword, location_code, language_code) DO UPDATE SET
        search_volume = EXCLUDED.search_volume,
        cpc = EXCLUDED.cpc,
        competition = EXCLUDED.competition,
        competition_level = EXCLUDED.competition_level,
        keyword_difficulty = EXCLUDED.keyword_difficulty,
        intent = EXCLUDED.intent,
        secondary_intents = EXCLUDED.secondary_intents,
        monthly_searches = EXCLUDED.monthly_searches,
        source = EXCLUDED.source,
        fetched_at = EXCLUDED.fetched_at`;
  }
}
