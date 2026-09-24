import { Global, Module } from "@nestjs/common";

import { ProviderCacheService } from "../providers/provider-cache.service.js";
import { KeywordListsService } from "./keyword-lists.service.js";
import { KeywordMetricsService } from "./keyword-metrics.service.js";
import { KeywordResearchService } from "./keyword-research.service.js";

/** Keyword metrics, research and lists, used by the api and the worker. */
@Global()
@Module({
  providers: [
    ProviderCacheService,
    KeywordMetricsService,
    KeywordResearchService,
    KeywordListsService,
  ],
  exports: [
    ProviderCacheService,
    KeywordMetricsService,
    KeywordResearchService,
    KeywordListsService,
  ],
})
export class KeywordsModule {}
