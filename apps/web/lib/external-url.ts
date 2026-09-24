/**
 * A link target for URLs that come from crawled sites or data providers: only absolute
 * http(s) URLs become links, so a `javascript:` or `data:` value can never be clicked.
 */
export function safeExternalHref(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}
