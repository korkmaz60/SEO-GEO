import type { AiAnswer } from "@seo-geo/dataforseo";
import { describe, expect, it } from "vitest";

import { analysisContext, analyzeAnswer, withoutNul } from "../src/ai-visibility/ai-analysis.js";
import {
  answerCost,
  pickDefaultModel,
  pickSentimentModel,
} from "../src/ai-visibility/ai-platforms.js";
import { buildVisibility, weekStart } from "../src/ai-visibility/ai-read-model.js";
import { normalizePrompt } from "../src/ai-visibility/prompts.service.js";

const answer = (text: string, urls: string[] = []): AiAnswer => ({
  text,
  model: null,
  sources: urls.map((url, index) => ({ rank: index + 1, url, domain: null, title: null })),
  searchResults: [],
  brandEntities: [],
  fanOutQueries: [],
  webSearch: null,
  checkUrl: null,
  fetchedAt: null,
  usage: null,
});

describe("AI platforms", () => {
  const claude = [
    { name: "claude-sonnet-4-5-20250929", webSearch: true, standard: true },
    { name: "claude-haiku-4-5-20251001", webSearch: true, standard: true },
    { name: "claude-3-haiku-20240307", webSearch: false, standard: true },
  ];

  it("defaults to the fallback model when listed, else the cheapest that searches", () => {
    expect(pickDefaultModel("CLAUDE", claude)).toBe("claude-haiku-4-5-20251001");
    expect(
      pickDefaultModel("CLAUDE", [
        ...claude,
        { name: "claude-haiku-4-5", webSearch: true, standard: true },
      ]),
    ).toBe("claude-haiku-4-5");
    expect(pickDefaultModel("CLAUDE", [])).toBe("claude-haiku-4-5");
    expect(
      pickDefaultModel("PERPLEXITY", [{ name: "sonar-pro", webSearch: false, standard: false }]),
    ).toBe("sonar-pro");
    expect(
      pickSentimentModel([
        { name: "gpt-5", webSearch: true, standard: true },
        { name: "gpt-4.1-mini", webSearch: true, standard: true },
      ]),
    ).toBe("gpt-4.1-mini");
  });

  it("prices queued answers at list price and live ones with the model's estimate", () => {
    expect(answerCost("CHATGPT", null)).toBe(0.0012);
    expect(answerCost("GOOGLE_AI_OVERVIEW", null)).toBe(0.0012);
    expect(answerCost("PERPLEXITY", "sonar")).toBe(0.0106);
    expect(answerCost("CLAUDE", "claude-opus-4-1")).toBe(0.6006);
  });
});

describe("answer analysis", () => {
  const context = analysisContext(
    { domain: "shop.example.com", includeSubdomains: false },
    [
      {
        id: "rival",
        kind: "COMPETITOR",
        name: "Rakip A",
        aliases: [],
        ambiguousAliases: [],
        domains: ["example.com"],
      },
      {
        id: "own",
        kind: "OWN",
        name: "Example Store",
        aliases: [],
        ambiguousAliases: [],
        domains: ["example.com"],
      },
    ],
    new Set(["https://shop.example.com/kahve"]),
  );

  it("puts the own brand first and gives it the project's domain", () => {
    expect(context.ownId).toBe("own");
    expect(context.domains[0]).toEqual({
      id: "own",
      domains: ["example.com", "shop.example.com"],
      includeSubdomains: false,
    });
  });

  it("finds mentions and citations and stores the answer in NFC", () => {
    const result = analyzeAnswer(
      answer("  Example Store ve Rakip A.  ", [
        "https://shop.example.com/kahve?utm_source=chatgpt.com",
        "https://blog.example.com/",
      ]),
      context,
    );
    expect(result.text).toBe("Example Store ve Rakip A.");
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.mentions.map((mention) => [mention.entityId, mention.firstRank])).toEqual([
      ["own", 1],
      ["rival", 2],
    ]);
    // The own brand wins the shared domain; subdomains only where the project allows them.
    expect(
      result.citations.map((citation) => [citation.host, citation.entityId, citation.pageUrl]),
    ).toEqual([
      ["shop.example.com", "own", "https://shop.example.com/kahve"],
      ["blog.example.com", "rival", null],
    ]);
    expect(analyzeAnswer(answer("   "), context)).toMatchObject({ text: null, hash: null });
  });

  it("drops NUL characters anywhere in an answer", () => {
    expect(withoutNul({ text: "a\u0000b", list: ["\u0000c"], count: 1, none: null })).toEqual({
      text: "ab",
      list: ["c"],
      count: 1,
      none: null,
    });
  });
});

describe("visibility read model", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-09-24")).toBe("2026-09-21");
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
  });

  it("adds up buckets by period, platform and week", () => {
    const view = buildVisibility({
      buckets: {
        runs: [
          { current: true, platform: "CHATGPT", week: "2026-09-14", runs: 2 },
          { current: true, platform: "GEMINI", week: "2026-09-21", runs: 2 },
          { current: false, platform: "CHATGPT", week: "2026-09-07", runs: 40 },
        ],
        mentions: [
          {
            current: true,
            platform: "CHATGPT",
            week: "2026-09-14",
            entityId: "own",
            mentioned: 2,
            rankSum: 2,
            prominenceSum: 2,
          },
          {
            current: true,
            platform: "GEMINI",
            week: "2026-09-21",
            entityId: "own",
            mentioned: 2,
            rankSum: 2,
            prominenceSum: 2,
          },
          {
            current: false,
            platform: "CHATGPT",
            week: "2026-09-07",
            entityId: "own",
            mentioned: 2,
            rankSum: 2,
            prominenceSum: 2,
          },
        ],
        citations: [
          { current: true, platform: "GEMINI", week: "2026-09-21", entityId: "own", cited: 1 },
        ],
      },
      entityIds: ["own"],
      platforms: ["CHATGPT", "CLAUDE"],
      start: "2026-09-16",
      end: "2026-09-25",
    });
    expect(view.overall[0]).toMatchObject({
      runs: 4,
      shareOfVoice: 1,
      averageRank: 1,
      previous: { score: expect.any(Number) },
      significantChange: true,
    });
    expect(view.overall[0]?.mentionRate?.value).toBe(1);
    expect(view.overall[0]?.citationRate?.value).toBe(0.25);
    expect(view.platforms.map((entry) => [entry.platform, entry.runs])).toEqual([
      ["CHATGPT", 2],
      ["GEMINI", 2],
      ["CLAUDE", 0],
    ]);
    expect(view.trend.map((week) => [week.weekStart, week.runs])).toEqual([
      ["2026-09-14", 2],
      ["2026-09-21", 2],
    ]);
  });
});

describe("prompts", () => {
  it("stores prompts in NFC with single spaces", () => {
    expect(normalizePrompt("  en iyi\n\t kahve?  ")).toBe("en iyi kahve?");
    // Decomposed "ü" and "ç" become single characters.
    expect(normalizePrompt("Tu\u0308rkc\u0327e")).toBe("Türkçe");
  });
});
