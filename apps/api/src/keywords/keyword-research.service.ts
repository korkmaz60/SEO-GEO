import { Injectable } from "@nestjs/common";
import {
  ResearchKeywordSchema,
  type KeywordResearch,
  type KeywordResearchQuote,
  type KeywordResearchResult,
  type ResearchKeyword,
  type ResearchMode,
} from "@seo-geo/contracts";
import { normalizeKeyword } from "@seo-geo/core";
import {
  estimateLabsCost,
  getKeywordIdeas,
  getKeywordSuggestions,
  getRelatedKeywords,
  type DataForSeoClient,
  type KeywordData,
} from "@seo-geo/dataforseo";
import { z } from "zod";

import { CredentialsService } from "../credentials/credentials.service.js";
import { ProviderCacheService } from "../providers/provider-cache.service.js";
import { providerProblem } from "../providers/provider-errors.js";
import { UsageService } from "../usage/usage.service.js";
import { KeywordMetricsService } from "./keyword-metrics.service.js";

/** Research results are market data that changes slowly. */
const RESEARCH_TTL_DAYS = 7;

/** Versioned cache operations; bump the version when the cached shape changes. */
const OPERATIONS: Record<ResearchMode, string> = {
  ideas: "labs.keyword_ideas@1",
  suggestions: "labs.keyword_suggestions@1",
  related: "labs.related_keywords@1",
};

const CachedResultSchema = z.object({
  seed: ResearchKeywordSchema.nullable(),
  items: z.array(ResearchKeywordSchema),
  totalCount: z.int(),
});
type CachedResult = z.infer<typeof CachedResultSchema>;

function toResearchKeyword(data: KeywordData): ResearchKeyword {
  return {
    keyword: data.keyword,
    searchVolume: data.searchVolume === null ? null : Math.round(data.searchVolume),
    cpc: data.cpc,
    competition: data.competition,
    competitionLevel: data.competitionLevel,
    keywordDifficulty: data.keywordDifficulty,
    intent: data.intent,
    secondaryIntents: data.secondaryIntents,
    monthlySearches: data.monthlySearches.map((entry) => ({
      year: entry.year,
      month: entry.month,
      searchVolume: entry.searchVolume === null ? null : Math.round(entry.searchVolume),
    })),
    trend: data.trend,
  };
}

/** Keyword research with DataForSEO Labs, cached for all workspaces. */
@Injectable()
export class KeywordResearchService {
  constructor(
    private readonly credentials: CredentialsService,
    private readonly cache: ProviderCacheService,
    private readonly usage: UsageService,
    private readonly metrics: KeywordMetricsService,
  ) {}

  async quote(input: KeywordResearch): Promise<KeywordResearchQuote> {
    const request = this.normalize(input);
    const cached = await this.cache.has(OPERATIONS[input.mode], request);
    return {
      cached,
      estimatedCostUsd: cached ? 0 : estimateLabsCost({ items: input.limit }),
    };
  }

  async research(workspaceId: string, input: KeywordResearch): Promise<KeywordResearchResult> {
    const request = this.normalize(input);
    const operation = OPERATIONS[input.mode];
    const cached = await this.cache.get(operation, request, CachedResultSchema);
    if (cached) {
      return {
        mode: input.mode,
        ...this.describe(request),
        ...cached.value,
        cached: true,
        costUsd: 0,
        fetchedAt: cached.fetchedAt.toISOString(),
      };
    }

    const client = await this.credentials.dataForSeoClient(workspaceId);
    await this.usage.assertCanSpend(workspaceId, estimateLabsCost({ items: input.limit }));
    let fetched: { result: CachedResult; raw: KeywordData[]; cost: number };
    try {
      fetched = await this.fetch(client, input.mode, request);
    } catch (error) {
      throw providerProblem(error);
    }

    const now = new Date();
    await this.metrics.store(request, fetched.raw, now);
    await this.cache.set(
      {
        provider: "DATAFORSEO",
        operation,
        params: request,
        value: fetched.result,
        costUsd: fetched.cost,
        ttlDays: RESEARCH_TTL_DAYS,
      },
      now,
    );
    await this.usage.record({
      workspaceId,
      provider: "DATAFORSEO",
      operation: operation.split("@")[0] as string,
      units: fetched.result.items.length,
      costUsd: fetched.cost,
    });
    return {
      mode: input.mode,
      ...this.describe(request),
      ...fetched.result,
      cached: false,
      costUsd: fetched.cost,
      fetchedAt: now.toISOString(),
    };
  }

  /** Cache key parameters: the normalized seed and the market. */
  private normalize(input: KeywordResearch) {
    return {
      keyword: normalizeKeyword(input.keyword, input.languageCode),
      locationCode: input.locationCode,
      languageCode: input.languageCode,
      limit: input.limit,
    };
  }

  private describe(request: ReturnType<KeywordResearchService["normalize"]>) {
    return {
      keyword: request.keyword,
      locationCode: request.locationCode,
      languageCode: request.languageCode,
    };
  }

  private async fetch(
    client: DataForSeoClient,
    mode: ResearchMode,
    request: ReturnType<KeywordResearchService["normalize"]>,
  ): Promise<{ result: CachedResult; raw: KeywordData[]; cost: number }> {
    const market = { locationCode: request.locationCode, languageCode: request.languageCode };
    switch (mode) {
      case "ideas": {
        const response = await getKeywordIdeas(client, {
          ...market,
          keywords: [request.keyword],
          limit: request.limit,
        });
        return {
          result: {
            seed: null,
            items: response.items.map(toResearchKeyword),
            totalCount: response.totalCount,
          },
          raw: response.items,
          cost: response.cost,
        };
      }
      case "suggestions": {
        const response = await getKeywordSuggestions(client, {
          ...market,
          keyword: request.keyword,
          limit: request.limit,
          includeSeedKeyword: true,
        });
        return {
          result: {
            seed: response.seed ? toResearchKeyword(response.seed) : null,
            items: response.items.map(toResearchKeyword),
            totalCount: response.totalCount,
          },
          raw: response.seed ? [response.seed, ...response.items] : response.items,
          cost: response.cost,
        };
      }
      case "related": {
        const response = await getRelatedKeywords(client, {
          ...market,
          keyword: request.keyword,
          depth: 2,
          limit: request.limit,
          includeSeedKeyword: true,
        });
        return {
          result: {
            seed: response.seed ? toResearchKeyword(response.seed) : null,
            items: response.items.map(toResearchKeyword),
            totalCount: response.totalCount,
          },
          raw: response.seed ? [response.seed, ...response.items] : response.items,
          cost: response.cost,
        };
      }
    }
  }
}
