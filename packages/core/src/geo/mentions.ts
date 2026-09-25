import { registrableDomain } from "../domain.js";
import { foldText, foldWithOrigin, originalRange, wordCharCount } from "./text.js";

/** Version of the detection rules; stored with every analyzed answer. */
export const MENTION_DETECTOR_VERSION = 1;

/** Names shorter than this (letters and digits) are treated as ambiguous. */
const MIN_UNAMBIGUOUS_LENGTH = 3;

/** A tracked brand: the project's own brand or a competitor. */
export interface BrandToDetect {
  id: string;
  name: string;
  /** Other names the brand is mentioned by. */
  aliases: readonly string[];
  /**
   * Names that are also ordinary words, whether or not they are the name or an alias above;
   * they need supporting evidence.
   */
  ambiguousAliases?: readonly string[];
  /** Registrable domains of the brand, e.g. `example.com`. */
  domains: readonly string[];
}

export interface TextSpan {
  /** Offsets in the original answer, `[start, end)`. */
  start: number;
  end: number;
  /** A brand name or one of the brand's domains written in the text. */
  kind: "name" | "domain";
}

export interface DetectedMention {
  entityId: string;
  /** Order of the brand's first mention among the mentioned brands; 1 = first. */
  firstRank: number;
  /** Offset of the first mention in the answer. */
  firstOffset: number;
  mentionCount: number;
  spans: TextSpan[];
}

interface Candidate extends TextSpan {
  entityId: string;
  ambiguous: boolean;
}

const BOUNDARY_BEFORE = "(?<![\\p{L}\\p{N}])";
const BOUNDARY_AFTER = "(?![\\p{L}\\p{N}])";
/** Host names written in text, e.g. `example.com` or `www.shop.example.com.tr`. */
const HOSTNAME =
  /(?<![\p{L}\p{N}.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?![\p{L}\p{N}-])/gu;
/** Targets of Markdown links and images: not visible text. */
const MARKDOWN_TARGET = /\]\(([^)\s]*)(?:\s+"[^"]*")?\)/gu;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A pattern for a folded name: its words separated by any whitespace. */
function namePattern(name: string): RegExp | null {
  const folded = foldText(name);
  if (!folded || wordCharCount(folded) === 0) return null;
  const body = folded.split(" ").map(escapeRegExp).join("\\s+");
  return new RegExp(`${BOUNDARY_BEFORE}${body}${BOUNDARY_AFTER}`, "gu");
}

/** Replaces Markdown link targets with spaces so that offsets stay the same. */
function maskLinkTargets(folded: string): string {
  return folded.replace(MARKDOWN_TARGET, (match) => `]${" ".repeat(match.length - 2)})`);
}

function brandDomains(brand: BrandToDetect): Set<string> {
  const domains = new Set<string>();
  for (const domain of brand.domains) {
    const registrable = registrableDomain(domain);
    if (registrable) domains.add(registrable);
  }
  return domains;
}

/**
 * Finds the tracked brands mentioned in an answer (docs/geo-aeo.md, "Detection"):
 *
 * - names and aliases match on word boundaries of any script, case-insensitively with the
 *   Turkish i forms folded together, so "Apple" does not match "Pineapple";
 * - host names written in the text count for the brand whose registrable domain they
 *   belong to (exact comparison, never substrings);
 * - names shorter than three letters or marked ambiguous count only when the same answer
 *   also shows stronger evidence for the brand: an unambiguous name, one of its domains in
 *   the text, or a citation of its domains (`citedBrandIds`);
 * - where matches overlap, the longest wins ("Example Store" over "Example").
 *
 * Markdown link targets are ignored (only visible text counts), and names inside host names
 * are not mentions ("example" in `example.com.evil.net`).
 */
export function detectMentions(
  answer: string,
  brands: readonly BrandToDetect[],
  options: { citedBrandIds?: ReadonlySet<string> } = {},
): DetectedMention[] {
  const folded = foldWithOrigin(answer);
  const visible = maskLinkTargets(folded.text);
  const candidates: Candidate[] = [];

  // Host names are domains, not names: "example" in "example.com.evil.net" is no mention.
  const hosts = [...visible.matchAll(HOSTNAME)].map((match) => ({
    host: match[1] ?? "",
    start: match.index,
    end: match.index + (match[1] ?? "").length,
  }));
  // A name that is itself a host name ("Booking.com") still counts.
  const insideHost = (start: number, end: number) =>
    hosts.some(
      (host) => start < host.end && end > host.start && !(start === host.start && end === host.end),
    );

  for (const brand of brands) {
    const ambiguous = new Set((brand.ambiguousAliases ?? []).map(foldText));
    const names = new Map<string, boolean>();
    for (const name of [brand.name, ...brand.aliases, ...(brand.ambiguousAliases ?? [])]) {
      const key = foldText(name);
      if (!key || names.has(key)) continue;
      names.set(key, ambiguous.has(key) || wordCharCount(key) < MIN_UNAMBIGUOUS_LENGTH);
    }
    for (const [name, isAmbiguous] of names) {
      const pattern = namePattern(name);
      if (!pattern) continue;
      for (const match of visible.matchAll(pattern)) {
        const end = match.index + match[0].length;
        if (insideHost(match.index, end)) continue;
        const range = originalRange(folded, match.index, end);
        candidates.push({ ...range, kind: "name", entityId: brand.id, ambiguous: isAmbiguous });
      }
    }
  }

  const domainOwners = new Map<string, string>();
  for (const brand of brands) {
    for (const domain of brandDomains(brand)) {
      if (!domainOwners.has(domain)) domainOwners.set(domain, brand.id);
    }
  }
  for (const host of hosts) {
    const owner = domainOwners.get(registrableDomain(host.host) ?? "");
    if (!owner) continue;
    const range = originalRange(folded, host.start, host.end);
    candidates.push({ ...range, kind: "domain", entityId: owner, ambiguous: false });
  }

  return resolve(candidates, options.citedBrandIds ?? new Set());
}

function resolve(candidates: Candidate[], citedBrandIds: ReadonlySet<string>): DetectedMention[] {
  // Longest match first at each position; overlapping shorter matches are dropped.
  candidates.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const accepted: Candidate[] = [];
  let reachedUntil = -1;
  for (const candidate of candidates) {
    if (candidate.start < reachedUntil) continue;
    accepted.push(candidate);
    reachedUntil = candidate.end;
  }

  const confirmed = new Set(citedBrandIds);
  for (const candidate of accepted) if (!candidate.ambiguous) confirmed.add(candidate.entityId);

  const byBrand = new Map<string, TextSpan[]>();
  for (const candidate of accepted) {
    if (!confirmed.has(candidate.entityId)) continue;
    const spans = byBrand.get(candidate.entityId) ?? [];
    spans.push({ start: candidate.start, end: candidate.end, kind: candidate.kind });
    byBrand.set(candidate.entityId, spans);
  }

  return [...byBrand]
    .map(([entityId, spans]) => ({
      entityId,
      firstRank: 0,
      firstOffset: spans[0]?.start ?? 0,
      mentionCount: spans.length,
      spans,
    }))
    .sort((a, b) => a.firstOffset - b.firstOffset)
    .map((mention, index) => ({ ...mention, firstRank: index + 1 }));
}
