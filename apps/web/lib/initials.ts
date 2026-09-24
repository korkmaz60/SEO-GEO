/** Up to two initials for avatars, e.g. "Ada Lovelace" → "AL", "example.com" → "E". */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    words.length > 1 && !name.includes(".")
      ? [words[0], words.at(-1)].map((word) => Array.from(word ?? "")[0] ?? "")
      : [Array.from(words[0] ?? "?")[0] ?? "?"];
  return letters.join("").toLocaleUpperCase();
}
