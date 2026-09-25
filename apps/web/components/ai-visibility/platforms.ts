import { AI_PLATFORMS, type AiPlatform } from "@seo-geo/contracts";

/**
 * Product names, the same in every language. Platforms are told apart by name, never by
 * color: the categorical colors belong to the brands.
 */
export const PLATFORM_NAMES: Record<AiPlatform, string> = {
  CHATGPT: "ChatGPT",
  GEMINI: "Gemini",
  PERPLEXITY: "Perplexity",
  CLAUDE: "Claude",
  GOOGLE_AI_MODE: "Google AI Mode",
  GOOGLE_AI_OVERVIEW: "Google AI Overviews",
};

/** Three-letter codes for dense cells; the full name is in the tooltip and for screen readers. */
export const PLATFORM_CODES: Record<AiPlatform, string> = {
  CHATGPT: "GPT",
  GEMINI: "GEM",
  PERPLEXITY: "PPX",
  CLAUDE: "CLD",
  GOOGLE_AI_MODE: "AIM",
  GOOGLE_AI_OVERVIEW: "AIO",
};

export { AI_PLATFORMS };

/** Platforms in display order. */
export function sortPlatforms<T extends { platform: AiPlatform }>(entries: readonly T[]): T[] {
  return [...entries].sort(
    (a, b) => AI_PLATFORMS.indexOf(a.platform) - AI_PLATFORMS.indexOf(b.platform),
  );
}
