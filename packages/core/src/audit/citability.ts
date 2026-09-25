import { CITABILITY_FACTORS, type CitabilityFactor } from "@seo-geo/contracts";

import { foldText } from "../geo/text.js";
import { AI_SEARCH_CRAWLERS } from "./robots.js";
import type { PageFacts } from "./html.js";

/** Version of the citability formula; stored with every scored page. */
export const CITABILITY_SCORE_VERSION = 1;

export { CITABILITY_FACTORS, type CitabilityFactor };

/** Weights of v1 (docs/geo-aeo.md, "Page citability score v1"); they add up to 1. */
export const CITABILITY_WEIGHTS: Record<CitabilityFactor, number> = {
  answer_first: 0.15,
  question_headings: 0.1,
  structured_content: 0.1,
  structured_data: 0.15,
  authorship: 0.1,
  freshness: 0.1,
  evidence: 0.1,
  readability: 0.1,
  ai_crawler_access: 0.1,
};

/** JSON-LD types that help answers quote a page, with their common subtypes. */
export const CITABLE_SCHEMA_TYPES = new Set([
  "Article",
  "NewsArticle",
  "BlogPosting",
  "TechArticle",
  "ScholarlyArticle",
  "Report",
  "FAQPage",
  "QAPage",
  "HowTo",
  "Recipe",
  "Product",
  "Review",
  "Organization",
  "LocalBusiness",
  "Corporation",
  "Person",
  "BreadcrumbList",
]);

export const CITABILITY_THRESHOLDS = {
  introWords: { full: [30, 80], partial: [15, 120] },
  /** Share of the H1's topic terms the introduction should contain. */
  introTopicShare: 0.5,
  questionHeadingShare: 0.3,
  /** One list or table per this many words of main text. */
  wordsPerStructure: 600,
  freshDays: 365,
  staleDays: 730,
  figures: 3,
  /** Readability is judged from this many words of main text. */
  readabilityMinWords: 100,
  readability: { full: [50, 70], partial: [30, 90] },
} as const;

export type CitabilityData = Record<string, string | number | boolean | string[] | null>;

export interface CitabilityFactorResult {
  /** 0–1; `null` when the factor cannot be judged (it then does not count). */
  value: number | null;
  /** What the value was computed from, for explanations and recommendations. */
  data: CitabilityData;
}

export interface CitabilityResult {
  version: number;
  /** 0–100. */
  score: number;
  factors: Record<CitabilityFactor, CitabilityFactorResult>;
}

export interface CitabilityInput {
  url: string;
  facts: PageFacts;
  /** Whether a URL belongs to the audited site. */
  isInternal: (url: string) => boolean;
  /** AI search crawlers robots.txt keeps away from the page. */
  blockedAiSearch: readonly string[];
  /** Language when the page does not declare one, e.g. the project's (`tr`, `en`). */
  defaultLanguage: string;
  now: Date;
}

/** Words compare folded ("nasıl" as "nasil"), so the lists are folded too. */
function folded(words: readonly string[]): Set<string> {
  return new Set(words.map(foldText));
}

const STOPWORDS = folded([
  // Turkish
  "ve",
  "ile",
  "için",
  "bir",
  "bu",
  "şu",
  "da",
  "de",
  "en",
  "mi",
  "mı",
  "mu",
  "mü",
  "ne",
  "gibi",
  "daha",
  "çok",
  "olan",
  "nasıl",
  "nedir",
  "neden",
  "hangi",
  "rehberi",
  "rehber",
  // English
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "what",
  "how",
  "why",
  "are",
  "you",
  "your",
  "best",
  "guide",
]);

const TURKISH_QUESTION_WORDS = folded([
  "ne",
  "neden",
  "niçin",
  "niye",
  "nasıl",
  "nedir",
  "nelerdir",
  "hangi",
  "hangisi",
  "hangileri",
  "kim",
  "kimdir",
  "kaç",
  "nerede",
  "nereden",
  "nereye",
  "mi",
  "mı",
  "mu",
  "mü",
  "midir",
  "mıdır",
  "mudur",
  "müdür",
]);
/** Question words that take suffixes: "hangisini", "nereden", "nasıldır". */
const TURKISH_QUESTION_STEMS = [...folded(["hangi", "nere", "nasıl"])];
const ENGLISH_QUESTION_STARTS = folded([
  "what",
  "why",
  "how",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "whose",
  "can",
  "could",
  "does",
  "do",
  "did",
  "is",
  "are",
  "should",
  "will",
  "would",
]);
const ABOUT_OR_CONTACT =
  /(?:^|[^\p{L}])(about|about-us|hakkimizda|hakkımızda|hakkinda|hakkında|kurumsal|biz-kimiz|contact|contact-us|iletisim|iletişim|bize-ulasin|bize-ulaşın|impressum|team|ekibimiz)(?:$|[^\p{L}])/iu;

const tokens = (text: string) => foldText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
const within = (value: number, [low, high]: readonly [number, number]) =>
  value >= low && value <= high;

function isQuestion(heading: string): boolean {
  if (heading.trim().endsWith("?")) return true;
  const words = tokens(heading);
  const turkish = (word: string) =>
    TURKISH_QUESTION_WORDS.has(word) ||
    TURKISH_QUESTION_STEMS.some((stem) => word.startsWith(stem));
  if (words.some(turkish)) return true;
  return ENGLISH_QUESTION_STARTS.has(words[0] ?? "");
}

/** Terms of a heading that name its topic: words of three or more letters, not stopwords. */
function topicTerms(heading: string): string[] {
  return [...new Set(tokens(heading).filter((word) => word.length >= 3 && !STOPWORDS.has(word)))];
}

function answerFirst(facts: PageFacts): CitabilityFactorResult {
  const intro = facts.content.intro;
  const heading = facts.h1.find(Boolean) ?? facts.title ?? "";
  const terms = topicTerms(heading);
  if (!intro) return { value: 0, data: { introWords: 0, topicShare: null } };
  const words = tokens(intro);
  const t = CITABILITY_THRESHOLDS;
  const length = within(words.length, t.introWords.full)
    ? 1
    : within(words.length, t.introWords.partial)
      ? 0.5
      : 0;
  // Turkish adds suffixes: "makinesi" and "makineleri" share the stem "makine".
  const stems = terms.map((term) => term.slice(0, Math.max(4, Math.min(term.length, 5))));
  const found = stems.filter((stem) => words.some((word) => word.startsWith(stem))).length;
  const topicShare = terms.length > 0 ? found / terms.length : null;
  const topic = topicShare === null ? 1 : Math.min(1, topicShare / t.introTopicShare);
  return {
    value: round(0.5 * length + 0.5 * topic),
    data: { introWords: words.length, topicShare: topicShare === null ? null : round(topicShare) },
  };
}

function questionHeadings(facts: PageFacts): CitabilityFactorResult {
  const headings = facts.content.subheadings;
  const questions = headings.filter(isQuestion).length;
  const share = headings.length > 0 ? questions / headings.length : 0;
  return {
    value: round(Math.min(1, share / CITABILITY_THRESHOLDS.questionHeadingShare)),
    data: { headings: headings.length, questions },
  };
}

function structuredContent(facts: PageFacts): CitabilityFactorResult {
  const { lists, tables, readability } = facts.content;
  const expected = Math.max(1, readability.words / CITABILITY_THRESHOLDS.wordsPerStructure);
  return {
    value: round(Math.min(1, (lists + tables) / expected)),
    data: { lists, tables, words: readability.words },
  };
}

function structuredData(facts: PageFacts): CitabilityFactorResult {
  const citable = facts.schemaTypes.filter((type) => CITABLE_SCHEMA_TYPES.has(type));
  const value =
    citable.length > 0
      ? facts.invalidJsonLd > 0
        ? 0.5
        : 1
      : facts.schemaTypes.length > 0
        ? 0.25
        : 0;
  return { value, data: { types: citable, invalid: facts.invalidJsonLd } };
}

function authorship(input: CitabilityInput): CitabilityFactorResult {
  const linksAbout = input.facts.links.some(
    (link) =>
      input.isInternal(link.url) &&
      (ABOUT_OR_CONTACT.test(decodedPath(link.url)) || ABOUT_OR_CONTACT.test(link.anchor)),
  );
  const author = input.facts.content.hasAuthor;
  return {
    value: 0.5 * Number(author) + 0.5 * Number(linksAbout),
    data: { author, aboutOrContact: linksAbout },
  };
}

function freshness(input: CitabilityInput): CitabilityFactorResult {
  const { modified, published } = input.facts.content;
  const now = input.now.getTime();
  // Dates in the future (beyond a day of clock skew) are not believed.
  const usable = [modified, published].filter(
    (date): date is string => date !== null && Date.parse(date) <= now + 86_400_000,
  );
  const date = usable[0] ?? null;
  if (!date) return { value: 0, data: { date: null, ageDays: null } };
  const ageDays = Math.max(0, Math.floor((now - Date.parse(date)) / 86_400_000));
  const t = CITABILITY_THRESHOLDS;
  return {
    value: ageDays <= t.freshDays ? 1 : ageDays <= t.staleDays ? 0.5 : 0,
    data: { date: date.slice(0, 10), ageDays },
  };
}

function evidence(input: CitabilityInput): CitabilityFactorResult {
  const external = new Set(
    input.facts.links
      .filter((link) => /^https?:/u.test(link.url) && !input.isInternal(link.url))
      .map((link) => link.url),
  ).size;
  const figures = input.facts.content.figures;
  return {
    value: round(
      0.5 * Number(external > 0) + 0.5 * Math.min(1, figures / CITABILITY_THRESHOLDS.figures),
    ),
    data: { externalLinks: external, figures },
  };
}

/**
 * Ateşman (Turkish) or Flesch Reading Ease (English) of the main text; `null` for other
 * languages and short texts.
 */
function readability(input: CitabilityInput): CitabilityFactorResult {
  const language = (input.facts.lang ?? input.defaultLanguage).toLowerCase().split(/[-_]/u)[0];
  const { words, sentences, vowels, syllables } = input.facts.content.readability;
  if (words < CITABILITY_THRESHOLDS.readabilityMinWords || sentences === 0) {
    return { value: null, data: { formula: null, score: null, words } };
  }
  let formula: "atesman" | "flesch";
  let score: number;
  if (language === "tr") {
    formula = "atesman";
    score = 198.825 - 40.175 * (vowels / words) - 2.61 * (words / sentences);
  } else if (language === "en") {
    formula = "flesch";
    score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
  } else {
    return { value: null, data: { formula: null, score: null, words } };
  }
  const t = CITABILITY_THRESHOLDS.readability;
  return {
    value: within(score, t.full) ? 1 : within(score, t.partial) ? 0.5 : 0,
    data: { formula, score: Math.round(score * 10) / 10, words },
  };
}

function aiCrawlerAccess(input: CitabilityInput): CitabilityFactorResult {
  const blocked = AI_SEARCH_CRAWLERS.filter((bot) => input.blockedAiSearch.includes(bot));
  return {
    value: round((AI_SEARCH_CRAWLERS.length - blocked.length) / AI_SEARCH_CRAWLERS.length),
    data: { blocked },
  };
}

function decodedPath(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return "";
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Page citability score v1 (docs/geo-aeo.md): `100 × Σ weight × factor` over the factors that
 * can be judged; the weights of the others (readability of languages without a formula) are
 * spread over the rest.
 */
export function citability(input: CitabilityInput): CitabilityResult {
  const factors: Record<CitabilityFactor, CitabilityFactorResult> = {
    answer_first: answerFirst(input.facts),
    question_headings: questionHeadings(input.facts),
    structured_content: structuredContent(input.facts),
    structured_data: structuredData(input.facts),
    authorship: authorship(input),
    freshness: freshness(input),
    evidence: evidence(input),
    readability: readability(input),
    ai_crawler_access: aiCrawlerAccess(input),
  };
  let weighted = 0;
  let weights = 0;
  for (const factor of CITABILITY_FACTORS) {
    const { value } = factors[factor];
    if (value === null) continue;
    weighted += CITABILITY_WEIGHTS[factor] * value;
    weights += CITABILITY_WEIGHTS[factor];
  }
  return {
    version: CITABILITY_SCORE_VERSION,
    score: weights > 0 ? Math.round((100 * weighted) / weights) : 0,
    factors,
  };
}

/**
 * Factors below full score, most score to gain first: what to improve on the page. Each maps
 * to a recommendation template in the app.
 */
export function citabilityRecommendations(
  factors: Partial<Record<CitabilityFactor, { value: number | null }>>,
): CitabilityFactor[] {
  const gain = (factor: CitabilityFactor) =>
    CITABILITY_WEIGHTS[factor] * (1 - (factors[factor]?.value ?? 1));
  return CITABILITY_FACTORS.filter((factor) => {
    const value = factors[factor]?.value;
    return value !== null && value !== undefined && value < 1;
  }).sort(
    (a, b) => gain(b) - gain(a) || CITABILITY_FACTORS.indexOf(a) - CITABILITY_FACTORS.indexOf(b),
  );
}
