import { describe, expect, it } from "vitest";

import {
  citability,
  citabilityRecommendations,
  extractPageFacts,
  type CitabilityInput,
} from "../src/audit/index.js";

const NOW = new Date("2026-09-25T12:00:00Z");
const URL_ = "https://www.example.com/blog/kahve-makinesi-secimi";

const sentence =
  "Kahve makinesi seçerken bütçe, kullanım sıklığı ve temizlik kolaylığı önemlidir. ";

const article = `<!doctype html>
<html lang="tr">
<head>
  <title>Kahve makinesi seçimi</title>
  <meta name="author" content="Ayşe Yılmaz">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"BlogPosting","headline":"Kahve makinesi seçimi","dateModified":"2026-06-01T09:00:00+03:00",
       "datePublished":"2025-01-10","author":{"@type":"Person","name":"Ayşe Yılmaz"}},
      {"@type":"BreadcrumbList","itemListElement":[]}
    ]}
  </script>
</head>
<body>
  <header><nav><ul><li><a href="/">Ana sayfa</a></li><li><a href="/hakkimizda">Hakkımızda</a></li></ul></nav></header>
  <article>
    <h1>Kahve makinesi nasıl seçilir?</h1>
    <p>Yazar: Ayşe Yılmaz</p>
    <p>Kahve makinesi seçimi; bütçenize, günde kaç fincan içtiğinize ve hangi kahve türlerini
    sevdiğinize bağlıdır. Espresso seviyorsanız tam otomatik bir makine, filtre kahve için ise
    damlatmalı bir makine en iyi seçimdir. Türkiye'de satılan makinelerin %35'i tam otomatiktir.</p>
    <h2>Hangi kahve makinesi türleri var?</h2>
    <ul><li>Tam otomatik</li><li>Manuel espresso</li><li>Filtre</li></ul>
    <h2>Fiyatlar ne kadar?</h2>
    <table><tr><th>Tür</th><th>Fiyat</th></tr><tr><td>Filtre</td><td>1.200 TL</td></tr></table>
    <h2>Bakım</h2>
    <p>${sentence.repeat(14)}Ortalama ömür 7,5 yıldır ve bakım maliyeti yılda 450 TL civarındadır.</p>
    <p>Kaynak: <a href="https://tr.wikipedia.org/wiki/Kahve_makinesi">Vikipedi</a></p>
  </article>
  <footer><a href="/iletisim">İletişim</a></footer>
</body>
</html>`;

function input(html: string, overrides: Partial<CitabilityInput> = {}): CitabilityInput {
  return {
    url: URL_,
    facts: extractPageFacts(html, URL_),
    isInternal: (url) => new URL(url).hostname === "www.example.com",
    blockedAiSearch: [],
    defaultLanguage: "tr",
    now: NOW,
    ...overrides,
  };
}

describe("content facts", () => {
  it("reads the article without navigation, header and footer", () => {
    const { content } = extractPageFacts(article, URL_);
    expect(content.intro?.startsWith("Kahve makinesi seçimi; bütçenize")).toBe(true);
    expect(content.subheadings).toEqual([
      "Hangi kahve makinesi türleri var?",
      "Fiyatlar ne kadar?",
      "Bakım",
    ]);
    // The navigation list is not content.
    expect(content.lists).toBe(1);
    expect(content.tables).toBe(1);
    expect(content.hasAuthor).toBe(true);
    expect(content.modified).toBe("2026-06-01T06:00:00.000Z");
    expect(content.published).toBe("2025-01-10T00:00:00.000Z");
    // %35, 1.200, 7,5 and 450; not the years.
    expect(content.figures).toBe(4);
    expect(content.readability.words).toBeGreaterThan(150);
  });

  it("counts figures but not years or plain small numbers", () => {
    const facts = extractPageFacts(
      "<body><main><p>2024 yılında 3 kişi; oran %12, 45% ve 0.75; toplam 12.500 ve 99 adet.</p></main></body>",
      URL_,
    );
    expect(facts.content.figures).toBe(5);
  });
});

describe("citability v1", () => {
  it("scores a well-structured article highly", () => {
    const result = citability(input(article));
    expect(result.version).toBe(1);
    expect(result.factors.answer_first).toMatchObject({ value: 1 });
    expect(result.factors.question_headings).toEqual({
      value: 1,
      data: { headings: 3, questions: 2 },
    });
    expect(result.factors.structured_content.value).toBe(1);
    expect(result.factors.structured_data).toEqual({
      value: 1,
      data: { types: ["BlogPosting", "Person", "BreadcrumbList"], invalid: 0 },
    });
    expect(result.factors.authorship).toEqual({
      value: 1,
      data: { author: true, aboutOrContact: true },
    });
    expect(result.factors.freshness).toEqual({
      value: 1,
      data: { date: "2026-06-01", ageDays: 116 },
    });
    expect(result.factors.evidence).toEqual({
      value: 1,
      data: { externalLinks: 1, figures: 4 },
    });
    expect(result.factors.readability.data).toMatchObject({ formula: "atesman" });
    expect(result.factors.ai_crawler_access).toEqual({ value: 1, data: { blocked: [] } });
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("scores a bare page low and recommends the biggest gains first", () => {
    const bare = "<html><body><h1>Ürünler</h1><p>Kısa bir metin.</p></body></html>";
    const result = citability(
      input(bare, { blockedAiSearch: ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot"] }),
    );
    expect(result.factors.answer_first).toEqual({
      value: 0,
      data: { introWords: 0, topicShare: null },
    });
    expect(result.factors.ai_crawler_access.value).toBe(0.5);
    // Too little text to judge readability: left out of the score.
    expect(result.factors.readability.value).toBeNull();
    expect(result.score).toBeLessThan(10);
    expect(citabilityRecommendations(result.factors).slice(0, 3)).toEqual([
      "answer_first",
      "structured_data",
      "question_headings",
    ]);
  });

  it("gives partial credit for introductions that are too long or off topic", () => {
    const long = `<html lang="en"><body><h1>Espresso grinders</h1><p>${"Coffee beans need care. ".repeat(
      25,
    )}</p></body></html>`;
    const result = citability(input(long, { defaultLanguage: "en" }));
    // 100 words: partial length; "espresso" and "grinders" are missing.
    expect(result.factors.answer_first).toEqual({
      value: 0.25,
      data: { introWords: 100, topicShare: 0 },
    });
  });

  it("uses Flesch Reading Ease for English pages", () => {
    const english = `<html lang="en-GB"><body><main><p>${"The cat sat on the mat. ".repeat(
      30,
    )}</p></main></body></html>`;
    const result = citability(input(english));
    expect(result.factors.readability.data).toMatchObject({ formula: "flesch", words: 180 });
    // Very short sentences of one-syllable words: very easy, which is not penalized.
    expect(result.factors.readability.value).toBe(1);
  });

  it("does not believe dates in the future and ages older pages", () => {
    const dated = (date: string) =>
      `<html><head><meta property="article:modified_time" content="${date}"></head><body></body></html>`;
    expect(citability(input(dated("2030-01-01"))).factors.freshness.value).toBe(0);
    expect(citability(input(dated("2025-03-01"))).factors.freshness.value).toBe(0.5);
    expect(citability(input(dated("2023-03-01"))).factors.freshness.value).toBe(0);
  });

  it("recognizes question headings in Turkish and English", () => {
    const headings = (list: string[]) =>
      `<html><body><main>${list.map((text) => `<h2>${text}</h2>`).join("")}</main></body></html>`;
    const result = citability(
      input(
        headings([
          "Kahve makinesi nedir",
          "Hangisini almalı",
          "How to descale a machine",
          "Fiyat listesi",
          "Garanti koşulları",
          "Teknik özellikler",
          "Kullanım",
          "Temizlik",
          "Yorumlar",
          "Sonuç",
        ]),
      ),
    );
    expect(result.factors.question_headings.data).toEqual({ headings: 10, questions: 3 });
    expect(result.factors.question_headings.value).toBe(1);
  });
});

describe("Turkish word lists", () => {
  it("compare folded, like the text they are matched against", () => {
    const html = `<html lang="tr"><body><main><h1>Espresso nasıl yapılır</h1>
      <p>Espresso yapmak için ince çekilmiş kahve, doğru basınç ve taze çekirdek gerekir; yapılışı kolaydır.</p>
      <h2>Süt nasıl köpürtülür</h2><h2>Malzemeler</h2></main></body></html>`;
    const result = citability(input(html));
    // "nasıl" is neither a topic term nor a missed question word.
    expect(result.factors.answer_first.data).toEqual({ introWords: 14, topicShare: 1 });
    expect(result.factors.question_headings.data).toEqual({ headings: 2, questions: 1 });
  });
});
