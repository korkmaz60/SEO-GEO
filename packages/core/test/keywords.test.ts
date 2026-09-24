import { describe, expect, it } from "vitest";

import { keywordProblem, normalizeKeyword } from "../src/index.js";

describe("normalizeKeyword", () => {
  it("trims, collapses spaces and lowercases", () => {
    expect(normalizeKeyword("  Kahve   Makinesi \t")).toBe("kahve makinesi");
    expect(normalizeKeyword("SEO Tools", "en")).toBe("seo tools");
  });

  it("uses Turkish casing for Turkish keywords", () => {
    expect(normalizeKeyword("IŞIK", "tr")).toBe("ışık");
    expect(normalizeKeyword("İstanbul Otelleri", "tr")).toBe("istanbul otelleri");
    // Elsewhere the dotted capital still folds to a plain i.
    expect(normalizeKeyword("İstanbul hotels", "en")).toBe("istanbul hotels");
  });

  it("composes decomposed characters (NFC)", () => {
    expect(normalizeKeyword("café")).toBe("café");
  });
});

describe("keywordProblem", () => {
  it("checks length and word count", () => {
    expect(keywordProblem("")).toBe("empty");
    expect(keywordProblem("a".repeat(81))).toBe("too_long");
    expect(keywordProblem("bir iki üç dört beş altı yedi sekiz dokuz on onbir")).toBe(
      "too_many_words",
    );
    expect(keywordProblem("kahve makinesi")).toBeNull();
  });
});

describe("aiReferralName", () => {
  it("recognizes AI assistants by referrer host", async () => {
    const { aiReferralName } = await import("../src/index.js");
    expect(aiReferralName("chatgpt.com")).toBe("ChatGPT");
    expect(aiReferralName("www.perplexity.ai / referral")).toBe("Perplexity");
    expect(aiReferralName("gemini.google.com")).toBe("Gemini");
    expect(aiReferralName("google")).toBeNull();
    expect(aiReferralName("notchatgpt.com")).toBeNull();
  });
});
