import { describe, expect, it } from "vitest";

import {
  aiVisibilityScore,
  attributeCitations,
  brandVisibility,
  canonicalAnswerText,
  detectMentions,
  foldText,
  isSignificantChange,
  matchKnownPage,
  mentionContext,
  parseSentiment,
  sentimentPrompt,
  sourceShare,
  wilsonInterval,
  type BrandToDetect,
  type RunOutcome,
} from "../src/index.js";

const own: BrandToDetect = {
  id: "own",
  name: "Example Store",
  aliases: ["Example"],
  domains: ["example.com"],
};
const rival: BrandToDetect = {
  id: "rival",
  name: "Rakip A",
  aliases: [],
  domains: ["rakip-a.com"],
};

function mentioned(text: string, brands: BrandToDetect[] = [own, rival]) {
  return detectMentions(text, brands).map((mention) => [
    mention.entityId,
    mention.firstRank,
    mention.mentionCount,
  ]);
}

describe("foldText", () => {
  it("folds case and the Turkish i forms together but keeps other diacritics", () => {
    expect(foldText("İSTANBUL")).toBe(foldText("istanbul"));
    expect(foldText("IŞIK")).toBe(foldText("ışık"));
    expect(foldText("ışık")).not.toBe(foldText("isik"));
    expect(foldText("  ﬁne   Kahve ")).toBe("fine kahve");
  });
});

describe("detectMentions", () => {
  it("finds brands on word boundaries and orders them by first mention", () => {
    const text = "Rakip A uygun fiyatlı; Example Store'un espresso seçenekleri daha geniş.";
    expect(mentioned(text)).toEqual([
      ["rival", 1, 1],
      ["own", 2, 1],
    ]);
    const [first, second] = detectMentions(text, [own, rival]);
    expect(text.slice(first!.spans[0]!.start, first!.spans[0]!.end)).toBe("Rakip A");
    expect(text.slice(second!.spans[0]!.start, second!.spans[0]!.end)).toBe("Example Store");
  });

  it("never matches inside other words", () => {
    const apple: BrandToDetect = { id: "apple", name: "Apple", aliases: [], domains: [] };
    expect(mentioned("Pineapple ve Applesauce", [apple])).toEqual([]);
    expect(mentioned("Apple'ın yeni modeli", [apple])).toEqual([["apple", 1, 1]]);
  });

  it("matches regardless of case, Turkish i forms and whitespace", () => {
    const brand: BrandToDetect = { id: "k", name: "İstanbul Kahve", aliases: [], domains: [] };
    const text = "☕ Öneri: ISTANBUL\nKAHVE ve istanbul kahve";
    const [mention] = detectMentions(text, [brand]);
    expect(mention?.mentionCount).toBe(2);
    expect(text.slice(mention!.spans[0]!.start, mention!.spans[0]!.end)).toBe("ISTANBUL\nKAHVE");
    expect(mention?.firstOffset).toBe(text.indexOf("ISTANBUL"));
  });

  it("prefers the longest match where names overlap", () => {
    expect(mentioned("Example Store bu konuda iddialı.")).toEqual([["own", 1, 1]]);
    const store: BrandToDetect = { id: "store", name: "Example Store", aliases: [], domains: [] };
    const short: BrandToDetect = { id: "short", name: "Example", aliases: [], domains: [] };
    expect(mentioned("Example Store ve Example farklı.", [short, store])).toEqual([
      ["store", 1, 1],
      ["short", 2, 1],
    ]);
  });

  it("counts domains written in the text, compared exactly", () => {
    expect(mentioned("Detaylar için rakip-a.com adresine bakın.")).toEqual([["rival", 1, 1]]);
    expect(mentioned("notexample.com ve example.com.evil.net")).toEqual([]);
    expect(mentioned("Bkz. www.shop.example.com")).toEqual([["own", 1, 1]]);
    const booking: BrandToDetect = { id: "b", name: "Booking.com", aliases: [], domains: [] };
    expect(mentioned("Otel için Booking.com'a bakın.", [booking])).toEqual([["b", 1, 1]]);
  });

  it("ignores Markdown link targets", () => {
    expect(mentioned("Bir kaynak: [buradan](https://www.example.com/kahve).")).toEqual([]);
    expect(mentioned("[example.com](https://www.example.com/kahve)")).toEqual([["own", 1, 1]]);
  });

  it("counts ambiguous names only with stronger evidence", () => {
    const mango: BrandToDetect = {
      id: "mango",
      name: "Mango",
      aliases: ["MNG"],
      ambiguousAliases: ["mango"],
      domains: ["mango.com"],
    };
    expect(mentioned("Mango ağacı tropik bir bitkidir.", [mango])).toEqual([]);
    expect(mentioned("Mango indirimde; mango.com üzerinden bakın.", [mango])).toEqual([
      ["mango", 1, 2],
    ]);
    expect(mentioned("MNG ve Mango aynı marka.", [mango])).toEqual([["mango", 1, 2]]);
    expect(
      detectMentions("Mango indirimde.", [mango], { citedBrandIds: new Set(["mango"]) }),
    ).toHaveLength(1);
    // Names shorter than three letters are ambiguous by themselves.
    const ab: BrandToDetect = { id: "ab", name: "AB", aliases: [], domains: [] };
    expect(mentioned("AB üyesi ülkeler", [ab])).toEqual([]);
  });
});

describe("attributeCitations", () => {
  const sources = [
    { rank: 1, url: "https://www.example.com/kahve?utm_source=x", domain: null, title: "Kahve" },
    { rank: 2, url: "https://blog.example.com/yazi", domain: "blog.example.com", title: null },
    { rank: 3, url: null, domain: "tr.wikipedia.org", title: "Vikipedi" },
    { rank: 4, url: "https://notexample.com/", domain: null, title: null },
    { rank: 5, url: "not a url", domain: null, title: null },
  ];

  it("attributes sources to brands by exact domain and keeps the registrable domain", () => {
    const citations = attributeCitations(sources, [
      { id: "own", domains: ["example.com"], includeSubdomains: false },
      { id: "rival", domains: ["rakip-a.com"] },
    ]);
    expect(citations.map((c) => [c.rank, c.host, c.domain, c.entityId])).toEqual([
      [1, "www.example.com", "example.com", "own"],
      [2, "blog.example.com", "example.com", null],
      [3, "tr.wikipedia.org", "wikipedia.org", null],
      [4, "notexample.com", "notexample.com", null],
    ]);
    const withSubdomains = attributeCitations(sources, [{ id: "own", domains: ["example.com"] }]);
    expect(withSubdomains[1]?.entityId).toBe("own");
  });

  it("matches cited URLs to known pages after normalization", () => {
    const pages = new Set(["https://www.example.com/kahve", "https://www.example.com/blog/"]);
    expect(matchKnownPage("https://www.example.com/kahve?utm_source=chatgpt#x", pages)).toBe(
      "https://www.example.com/kahve",
    );
    expect(matchKnownPage("https://www.example.com/blog", pages)).toBe(
      "https://www.example.com/blog/",
    );
    expect(matchKnownPage("https://www.example.com/", pages)).toBeNull();
    expect(matchKnownPage(null, pages)).toBeNull();
  });
});

describe("visibility metrics", () => {
  it("computes 95% Wilson intervals", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
    const none = wilsonInterval(0, 10);
    expect(none?.low).toBe(0);
    expect(none?.high).toBeCloseTo(0.2775, 4);
    const half = wilsonInterval(5, 10);
    expect(half?.value).toBe(0.5);
    expect(half?.low).toBeCloseTo(0.2366, 4);
    expect(half?.high).toBeCloseTo(0.7634, 4);
  });

  it("scores brands over a set of answers", () => {
    const runs: RunOutcome[] = [
      {
        mentions: new Map([
          ["own", 1],
          ["rival", 2],
        ]),
        cited: new Set(["own"]),
      },
      { mentions: new Map([["rival", 1]]), cited: new Set() },
      {
        mentions: new Map([
          ["own", 2],
          ["rival", 1],
        ]),
        cited: new Set(["rival"]),
      },
      { mentions: new Map(), cited: new Set() },
    ];
    const [ownStats, rivalStats] = brandVisibility(runs, ["own", "rival"]);
    expect(ownStats).toMatchObject({
      runs: 4,
      mentionedRuns: 2,
      citedRuns: 1,
      averageRank: 1.5,
      prominence: (1 + 0.5) / 4,
      shareOfVoice: 2 / 5,
      lowSample: true,
    });
    expect(ownStats?.mentionRate?.value).toBe(0.5);
    expect(ownStats?.citationRate?.value).toBe(0.25);
    // 100 × (0.45 × 0.5 + 0.35 × 0.25 + 0.20 × 0.375)
    expect(ownStats?.score).toBe(38.8);
    expect(rivalStats).toMatchObject({ mentionedRuns: 3, shareOfVoice: 3 / 5, averageRank: 4 / 3 });
    expect(aiVisibilityScore(1, 1, 1)).toBe(100);
    expect(brandVisibility([], ["own"])[0]).toMatchObject({ score: null, shareOfVoice: null });
  });

  it("measures source share over all citations", () => {
    expect(
      sourceShare([
        { domain: "b.com" },
        { domain: "a.com" },
        { domain: "b.com" },
        { domain: "c.com" },
      ]),
    ).toEqual([
      { domain: "b.com", citations: 2, share: 0.5 },
      { domain: "a.com", citations: 1, share: 0.25 },
      { domain: "c.com", citations: 1, share: 0.25 },
    ]);
  });

  it("calls a change significant only when the intervals do not overlap", () => {
    expect(isSignificantChange(wilsonInterval(2, 40), wilsonInterval(30, 40))).toBe(true);
    expect(isSignificantChange(wilsonInterval(5, 10), wilsonInterval(7, 10))).toBe(false);
    expect(isSignificantChange(null, wilsonInterval(1, 2))).toBe(false);
  });
});

describe("sentiment helpers", () => {
  const answer =
    "Kahve makineleri çok çeşitli. Example Store servis ağıyla övgü alıyor! Rakip A ise daha ucuz.";

  it("uses the sentence around a mention and keeps prompts within 500 characters", () => {
    const start = answer.indexOf("Example Store");
    expect(mentionContext(answer, { start, end: start + 13 })).toBe(
      "Example Store servis ağıyla övgü alıyor!",
    );
    const long = `${"çok uzun bir cümle ".repeat(60)}Example Store burada.`;
    const at = long.indexOf("Example Store");
    const context = mentionContext(long, { start: at, end: at + 13 }, 120);
    expect(context.length).toBeLessThanOrEqual(122);
    expect(context).toContain("Example Store");
    expect(sentimentPrompt("Example Store", "x".repeat(2000)).length).toBeLessThanOrEqual(500);
  });

  it("reads the classifier's JSON and rejects anything else", () => {
    expect(parseSentiment('Sure: {"sentiment":"Positive","confidence":0.92}')).toEqual({
      sentiment: "positive",
      confidence: 0.92,
    });
    expect(parseSentiment('{"sentiment":"mixed","confidence":1}')).toBeNull();
    expect(parseSentiment("positive")).toBeNull();
    expect(parseSentiment('{"sentiment":"negative","confidence":"high"}')).toEqual({
      sentiment: "negative",
      confidence: 0.5,
    });
  });

  it("stores answers in NFC", () => {
    expect(canonicalAnswerText("  şeker  ")).toBe("şeker");
  });
});
