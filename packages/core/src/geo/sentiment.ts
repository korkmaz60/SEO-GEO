/** Version of the sentiment prompt and parser; stored with every classified mention. */
export const SENTIMENT_CLASSIFIER_VERSION = 1;

export type Sentiment = "positive" | "neutral" | "negative";

/** LLM Responses take prompts of at most this many characters. */
const MAX_PROMPT_LENGTH = 500;
const SENTENCE_END = /[.!?…\n]/u;

/**
 * The sentence(s) around a mention, at most `maxLength` characters: what the classifier
 * reads instead of the whole answer (prompts are limited to 500 characters).
 */
export function mentionContext(
  answer: string,
  span: { start: number; end: number },
  maxLength = 320,
): string {
  let start = span.start;
  while (start > 0 && !SENTENCE_END.test(answer[start - 1] ?? "")) start--;
  let end = span.end;
  while (end < answer.length && !SENTENCE_END.test(answer[end] ?? "")) end++;
  if (end < answer.length) end++;

  let context = answer.slice(start, end);
  if (context.length > maxLength) {
    // Keep the mention in the middle of a window of maxLength characters.
    const middle = Math.floor((span.start + span.end) / 2) - start;
    const from = Math.max(
      0,
      Math.min(context.length - maxLength, middle - Math.floor(maxLength / 2)),
    );
    context = `${from > 0 ? "…" : ""}${context.slice(from, from + maxLength).trim()}${
      from + maxLength < context.length ? "…" : ""
    }`;
  }
  return context.replace(/\s+/gu, " ").trim();
}

/**
 * The classification prompt for one brand in one context, within the 500-character limit.
 * The model answers with JSON only.
 */
export function sentimentPrompt(brand: string, context: string): string {
  const head =
    `Classify the tone of this text toward "${brand.slice(0, 60)}". ` +
    'Reply with JSON only: {"sentiment":"positive|neutral|negative","confidence":0-1}. Text: ';
  const room = MAX_PROMPT_LENGTH - head.length;
  return head + (context.length > room ? `${context.slice(0, room - 1)}…` : context);
}

/** Reads the classifier's reply; `null` when it is not the requested JSON. */
export function parseSentiment(reply: string): { sentiment: Sentiment; confidence: number } | null {
  const json = /\{[^{}]*\}/u.exec(reply)?.[0];
  if (!json) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const sentiment = typeof record.sentiment === "string" ? record.sentiment.toLowerCase() : "";
  if (sentiment !== "positive" && sentiment !== "neutral" && sentiment !== "negative") return null;
  const confidence = Number(record.confidence);
  return {
    sentiment,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5,
  };
}
