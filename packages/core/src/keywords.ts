/** Longest keyword accepted, as in Google Ads and DataForSEO Labs. */
export const MAX_KEYWORD_LENGTH = 80;
/** Most words in a keyword, as in Google Ads and DataForSEO Labs. */
export const MAX_KEYWORD_WORDS = 10;

/** Languages whose lower case differs for I/İ (dotless ı and dotted i). */
const TURKIC_LANGUAGES = new Set(["tr", "az"]);

/**
 * Keyword text as it is stored and compared: Unicode NFC, trimmed, single spaces, lower
 * case. Turkish and Azerbaijani use their own casing ("IŞIK" → "ışık", "İstanbul" →
 * "istanbul"); elsewhere a dotted capital İ still folds to a plain "i".
 */
export function normalizeKeyword(input: string, languageCode?: string): string {
  const language = languageCode?.toLowerCase().split("-")[0];
  const text = input.normalize("NFC").trim().replace(/\s+/gu, " ");
  const lower =
    language && TURKIC_LANGUAGES.has(language)
      ? text.toLocaleLowerCase(language)
      : text.toLowerCase();
  return lower.replace(/i̇/gu, "i");
}

export type KeywordProblem = "empty" | "too_long" | "too_many_words";

/** Why a normalized keyword cannot be used, or `null` when it is fine. */
export function keywordProblem(keyword: string): KeywordProblem | null {
  if (keyword.length === 0) return "empty";
  if (keyword.length > MAX_KEYWORD_LENGTH) return "too_long";
  if (keyword.split(" ").length > MAX_KEYWORD_WORDS) return "too_many_words";
  return null;
}
