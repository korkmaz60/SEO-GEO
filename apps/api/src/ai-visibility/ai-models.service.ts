import { Injectable, Logger } from "@nestjs/common";
import { MODEL_PLATFORMS, type ModelPlatform } from "@seo-geo/contracts";
import {
  DataForSeoError,
  getLlmResponsesModels,
  type DataForSeoClient,
  type LlmModel,
  type LlmResponsesPlatform,
} from "@seo-geo/dataforseo";
import { z } from "zod";

import { ProviderCacheService } from "../providers/provider-cache.service.js";
import {
  FALLBACK_MODELS,
  RESPONSES_PLATFORMS,
  pickDefaultModel,
  pickSentimentModel,
  type DefaultModels,
} from "./ai-platforms.js";

const MODELS_TTL_DAYS = 1;

const ModelListSchema = z.array(
  z.object({ name: z.string(), webSearch: z.boolean(), standard: z.boolean() }),
);

/** The models DataForSEO offers through LLM Responses, cached for a day (listing is free). */
@Injectable()
export class AiModelsService {
  private readonly logger = new Logger("AiModels");

  constructor(private readonly cache: ProviderCacheService) {}

  /** Models of a platform; `null` when they cannot be listed right now. */
  async list(client: DataForSeoClient, platform: LlmResponsesPlatform): Promise<LlmModel[] | null> {
    const operation = `ai_optimization.${platform}.llm_responses.models`;
    const cached = await this.cache.get(operation, {}, ModelListSchema);
    if (cached) return cached.value;
    try {
      const { models, cost } = await getLlmResponsesModels(client, platform);
      await this.cache.set({
        provider: "DATAFORSEO",
        operation,
        params: {},
        value: models.map((model) => ({ ...model })),
        costUsd: cost,
        ttlDays: MODELS_TTL_DAYS,
      });
      return models;
    } catch (error) {
      if (!(error instanceof DataForSeoError)) throw error;
      this.logger.warn(`Listing ${platform} models failed: ${error.message}`);
      return null;
    }
  }

  /** The default model of every model-API platform (fallbacks when models cannot be listed). */
  async defaults(client: DataForSeoClient | null): Promise<DefaultModels> {
    const defaults = { ...FALLBACK_MODELS };
    if (!client) return defaults;
    for (const platform of MODEL_PLATFORMS) {
      const models = await this.list(client, RESPONSES_PLATFORMS[platform]);
      if (models) defaults[platform] = pickDefaultModel(platform, models);
    }
    return defaults;
  }

  async defaultModel(client: DataForSeoClient | null, platform: ModelPlatform): Promise<string> {
    if (!client) return FALLBACK_MODELS[platform];
    const models = await this.list(client, RESPONSES_PLATFORMS[platform]);
    return models ? pickDefaultModel(platform, models) : FALLBACK_MODELS[platform];
  }

  /** The ChatGPT model that classifies sentiment; `null` when models cannot be listed. */
  async sentimentModel(client: DataForSeoClient): Promise<string | null> {
    const models = await this.list(client, "chat_gpt");
    return models ? pickSentimentModel(models) : null;
  }
}
