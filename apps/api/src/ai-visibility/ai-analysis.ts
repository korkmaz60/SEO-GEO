import { createHash } from "node:crypto";

import {
  attributeCitations,
  canonicalAnswerText,
  detectMentions,
  matchKnownPage,
  type BrandDomains,
  type BrandToDetect,
  type TextSpan,
} from "@seo-geo/core";
import type { AiAnswer, GoogleOrganicSerp } from "@seo-geo/dataforseo";
import type { BrandEntity, Prisma } from "@seo-geo/db";

/** What answers of a project are analyzed against. */
export interface AnalysisContext {
  ownId: string | null;
  /** The own brand first, so that it wins where a domain is listed twice. */
  brands: BrandToDetect[];
  domains: BrandDomains[];
  /** Normalized URLs of the project's pages (site audit and Search Console). */
  knownPages: ReadonlySet<string>;
}

export interface AnswerAnalysis {
  /** The answer as stored (NFC, trimmed); `null` when empty. */
  text: string | null;
  hash: string | null;
  mentions: { entityId: string; firstRank: number; firstOffset: number; mentionCount: number }[];
  citations: {
    rank: number;
    url: string | null;
    host: string;
    domain: string;
    title: string | null;
    entityId: string | null;
    pageUrl: string | null;
  }[];
}

type BrandRow = Pick<
  BrandEntity,
  "id" | "kind" | "name" | "aliases" | "ambiguousAliases" | "domains"
>;

/**
 * The tracked brands of a project as detection targets. The own brand also owns the
 * project's domain, with the project's subdomain setting; competitors include subdomains.
 */
export function analysisContext(
  project: { domain: string; includeSubdomains: boolean },
  brands: readonly BrandRow[],
  knownPages: ReadonlySet<string>,
): AnalysisContext {
  const ordered = [...brands].sort((a, b) => Number(b.kind === "OWN") - Number(a.kind === "OWN"));
  const domainsOf = (brand: BrandRow) =>
    brand.kind === "OWN" ? [...new Set([...brand.domains, project.domain])] : brand.domains;
  return {
    ownId: ordered.find((brand) => brand.kind === "OWN")?.id ?? null,
    brands: ordered.map((brand) => ({
      id: brand.id,
      name: brand.name,
      aliases: brand.aliases,
      ambiguousAliases: brand.ambiguousAliases,
      domains: domainsOf(brand),
    })),
    domains: ordered.map((brand) => ({
      id: brand.id,
      domains: domainsOf(brand),
      includeSubdomains: brand.kind === "OWN" ? project.includeSubdomains : true,
    })),
    knownPages,
  };
}

/**
 * Brand mentions and attributed citations of an answer (docs/geo-aeo.md, "Detection").
 * A citation of a brand's domain also confirms the brand's ambiguous names.
 */
export function analyzeAnswer(answer: AiAnswer, context: AnalysisContext): AnswerAnalysis {
  const text = canonicalAnswerText(answer.text);
  const citations = attributeCitations(answer.sources, context.domains).map((citation) => ({
    ...citation,
    pageUrl: matchKnownPage(citation.url, context.knownPages),
  }));
  const citedBrandIds = new Set(citations.flatMap((citation) => citation.entityId ?? []));
  const mentions = text ? detectMentions(text, context.brands, { citedBrandIds }) : [];
  return {
    text: text || null,
    hash: text ? createHash("sha256").update(text).digest("hex") : null,
    mentions: mentions.map((mention) => ({
      entityId: mention.entityId,
      firstRank: mention.firstRank,
      firstOffset: mention.firstOffset,
      mentionCount: mention.mentionCount,
    })),
    citations,
  };
}

/**
 * Where the stored mentions appear in an answer, for highlighting. Only the brands the answer
 * was found to mention are searched, and their ambiguous names count as confirmed.
 */
export function mentionSpans(
  answer: string,
  brands: readonly BrandToDetect[],
  entityIds: ReadonlySet<string>,
): Map<string, TextSpan[]> {
  const mentioned = brands.filter((brand) => entityIds.has(brand.id));
  const detected = detectMentions(answer, mentioned, { citedBrandIds: entityIds });
  return new Map(detected.map((mention) => [mention.entityId, mention.spans]));
}

/**
 * The answer without NUL characters, which PostgreSQL cannot store in text or JSON. Scraped
 * pages occasionally contain them.
 */
export function withoutNul<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("\u0000", "") as T;
  if (Array.isArray(value)) return value.map(withoutNul) as T;
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, withoutNul(entry)]),
    ) as T;
  }
  return value;
}

/** The AI Overview of a Google results page as an answer; `null` when the page has none. */
export function aiOverviewAnswer(serp: GoogleOrganicSerp): AiAnswer | null {
  const overview = serp.aiOverview;
  if (!overview) return null;
  return {
    text: overview.markdown ?? "",
    model: null,
    sources: overview.references.map((reference, index) => ({
      rank: index + 1,
      url: reference.url,
      domain: reference.domain,
      title: reference.title,
    })),
    searchResults: [],
    brandEntities: [],
    fanOutQueries: [],
    webSearch: null,
    checkUrl: serp.checkUrl,
    fetchedAt: serp.fetchedAt,
    usage: null,
  };
}

/** Evidence kept with an answer (`ai_run.details`). */
export function answerDetails(answer: AiAnswer): Prisma.InputJsonObject {
  return {
    searchResults: answer.searchResults.map((source) => ({ ...source })),
    brandEntities: answer.brandEntities.map((entity) => ({ ...entity, urls: [...entity.urls] })),
    usage: answer.usage ? { ...answer.usage } : null,
    checkUrl: answer.checkUrl,
    fetchedAt: answer.fetchedAt,
  };
}
