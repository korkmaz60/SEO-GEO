import {
  AI_PLATFORM_METHODS,
  MODEL_PLATFORMS,
  type AiFrequency,
  type AiPlatform,
  type AiSettings,
  type ModelPlatform,
} from "@seo-geo/contracts";
import {
  DATAFORSEO_PRICES,
  estimateAiAnswerCost,
  estimateProviderAnswerCost,
  roundUsd,
  type LlmModel,
  type LlmResponsesPlatform,
  type LlmScraperPlatform,
} from "@seo-geo/dataforseo";

/** Days one answer per prompt, platform and sample covers. */
export const PERIOD_DAYS: Record<AiFrequency, number> = { DAILY: 1, WEEKLY: 7 };
/** Periods per 30 days, for monthly estimates. */
export const PERIODS_PER_MONTH: Record<AiFrequency, number> = { DAILY: 30, WEEKLY: 30 / 7 };

/**
 * Models asked when a project has not chosen one: the cheapest models of each family that
 * search the web. Used as they are when DataForSEO lists them; otherwise the cheapest listed
 * model that searches is taken.
 */
export const FALLBACK_MODELS: Record<ModelPlatform, string> = {
  CLAUDE: "claude-haiku-4-5",
  PERPLEXITY: "sonar",
};

export const SCRAPER_PLATFORMS = {
  CHATGPT: "chat_gpt",
  GEMINI: "gemini",
} as const satisfies Partial<Record<AiPlatform, LlmScraperPlatform>>;

export const RESPONSES_PLATFORMS = {
  CLAUDE: "claude",
  PERPLEXITY: "perplexity",
} as const satisfies Record<ModelPlatform, LlmResponsesPlatform>;

/**
 * Upper bound of classifying the tone of one mention: a live LLM Responses task without web
 * search and a short prompt (a few hundred tokens on a small model).
 */
export const SENTIMENT_COST_PER_MENTION = roundUsd(
  DATAFORSEO_PRICES.aiOptimization.llmResponsesTaskFee.live + 0.0004,
);

export function isModelPlatform(platform: AiPlatform): platform is ModelPlatform {
  return (MODEL_PLATFORMS as readonly AiPlatform[]).includes(platform);
}

/**
 * Upper-bound cost of one answer. ChatGPT, Gemini and Google are asked through the Standard
 * queue; Claude and Perplexity answer live (Perplexity has no queue, and live answers report
 * what the model provider charged).
 */
export function answerCost(platform: AiPlatform, model: string | null): number {
  const method = AI_PLATFORM_METHODS[platform];
  if (method === "llm_responses") {
    return estimateAiAnswerCost({ method, model: model ?? "" }, { mode: "live" });
  }
  return estimateAiAnswerCost({ method }, { mode: "standard" });
}

/** The model asked on a platform: the project's choice, else the default. */
export function modelOf(settings: AiSettings, platform: AiPlatform, defaults: DefaultModels) {
  if (!isModelPlatform(platform)) return null;
  return settings.models[platform] ?? defaults[platform];
}

export type DefaultModels = Record<ModelPlatform, string>;

/**
 * The default model of a platform among the models DataForSEO offers: the fallback model when
 * listed, else the cheapest listed model that searches the web (newest name first on ties).
 */
export function pickDefaultModel(platform: ModelPlatform, models: readonly LlmModel[]): string {
  const fallback = FALLBACK_MODELS[platform];
  // Perplexity's Sonar models always search; the others must support it.
  const usable = models.filter((model) => platform === "PERPLEXITY" || model.webSearch);
  if (usable.some((model) => model.name === fallback)) return fallback;
  const [cheapest] = [...usable].sort(
    (a, b) =>
      estimateProviderAnswerCost(a.name) - estimateProviderAnswerCost(b.name) ||
      b.name.localeCompare(a.name),
  );
  return cheapest?.name ?? fallback;
}

/** The model that classifies sentiment: the cheapest ChatGPT model (no web search needed). */
export function pickSentimentModel(models: readonly LlmModel[]): string | null {
  const [cheapest] = [...models].sort(
    (a, b) =>
      estimateProviderAnswerCost(a.name) - estimateProviderAnswerCost(b.name) ||
      b.name.localeCompare(a.name),
  );
  return cheapest?.name ?? null;
}
