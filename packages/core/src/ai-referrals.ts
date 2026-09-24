/**
 * Referrer hosts of AI assistants and answer engines. Visits from them show how much traffic
 * AI search sends to a site (GA4 reports the referrer as the session source).
 */
export const AI_REFERRAL_SOURCES = [
  { host: "chatgpt.com", name: "ChatGPT" },
  { host: "chat.openai.com", name: "ChatGPT" },
  { host: "perplexity.ai", name: "Perplexity" },
  { host: "gemini.google.com", name: "Gemini" },
  { host: "bard.google.com", name: "Gemini" },
  { host: "copilot.microsoft.com", name: "Copilot" },
  { host: "claude.ai", name: "Claude" },
  { host: "deepseek.com", name: "DeepSeek" },
  { host: "meta.ai", name: "Meta AI" },
  { host: "grok.com", name: "Grok" },
  { host: "you.com", name: "You.com" },
  { host: "phind.com", name: "Phind" },
  { host: "poe.com", name: "Poe" },
] as const;

/** The AI assistant a session source (host or `host / medium`) belongs to, if any. */
export function aiReferralName(source: string): string | null {
  const host = source.split("/")[0]?.trim().toLowerCase().replace(/^www\./u, "") ?? "";
  if (!host) return null;
  const match = AI_REFERRAL_SOURCES.find(
    (entry) => host === entry.host || host.endsWith(`.${entry.host}`),
  );
  return match?.name ?? null;
}
