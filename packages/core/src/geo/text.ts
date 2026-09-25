/**
 * Text folded for comparison, with a map back to the original text so that matches can be
 * reported (and highlighted) at their original positions.
 */
export interface FoldedText {
  /** The folded text. */
  text: string;
  /** For every UTF-16 unit of `text`, the index of the original unit it came from. */
  origin: number[];
  /** The original text. */
  source: string;
}

/** Combining dot above: `İ` lower-cased outside Turkish becomes `i` + U+0307. */
const COMBINING_DOT_ABOVE = "̇";
const TURKISH_I = new Set(["İ", "I", "ı"]);
const MARK = /\p{M}/u;

/**
 * Folds one character: compatibility forms (NFKC), lower case, and the Turkish `İ`, `I`,
 * `ı`, `i` on one form (`i`), so "İstanbul", "ISTANBUL" and "istanbul" compare equal.
 * Other diacritics are kept: `ş` does not match `s`.
 */
function foldChar(char: string): string {
  let folded = "";
  for (const part of char.normalize("NFKC")) {
    if (part === COMBINING_DOT_ABOVE) continue;
    folded += TURKISH_I.has(part) ? "i" : part.toLowerCase().replaceAll(COMBINING_DOT_ABOVE, "");
  }
  return folded;
}

/** Folds `text` for comparison and records where every folded unit came from. */
export function foldWithOrigin(text: string): FoldedText {
  let folded = "";
  const origin: number[] = [];
  let index = 0;
  for (const char of text) {
    const part = foldChar(char);
    folded += part;
    for (let unit = 0; unit < part.length; unit++) origin.push(index);
    index += char.length;
  }
  return { text: folded, origin, source: text };
}

/** Folds `text` for comparison; see {@link foldWithOrigin}. Whitespace runs become one space. */
export function foldText(text: string): string {
  return foldWithOrigin(text.trim()).text.replace(/\s+/gu, " ");
}

/** Maps a folded range `[start, end)` back to the original text. */
export function originalRange(
  folded: FoldedText,
  start: number,
  end: number,
): { start: number; end: number } {
  const from = folded.origin[start] ?? folded.source.length;
  const lastUnit = end > start ? folded.origin[end - 1] : undefined;
  if (lastUnit === undefined) return { start: from, end: from };
  const codePoint = folded.source.codePointAt(lastUnit) ?? 0;
  let to = lastUnit + (codePoint > 0xffff ? 2 : 1);
  // Combining marks after the last character belong to it.
  while (to < folded.source.length && MARK.test(folded.source[to] ?? "")) to++;
  return { start: from, end: to };
}

/**
 * An answer in the form it is stored and analyzed in: Unicode NFC (canonically equivalent,
 * so it looks the same) and trimmed. Mention offsets refer to this text.
 */
export function canonicalAnswerText(text: string): string {
  return text.normalize("NFC").trim();
}

/** Letters and digits in any script: the characters that make up words. */
export const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Number of letters and digits in `text`. */
export function wordCharCount(text: string): number {
  let count = 0;
  for (const char of text) if (WORD_CHAR.test(char)) count++;
  return count;
}
