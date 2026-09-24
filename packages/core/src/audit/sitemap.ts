import { gunzipSync } from "node:zlib";

import { load } from "cheerio";

export interface ParsedSitemap {
  kind: "urlset" | "sitemapindex" | "invalid";
  /** `<loc>` values: page URLs for a urlset, sitemap URLs for an index. */
  locations: string[];
}

/** Largest decompressed sitemap read (the protocol allows 50 MB). */
const MAX_SITEMAP_BYTES = 50 * 1024 * 1024;

/** Decodes a sitemap body, including `.xml.gz` files served without Content-Encoding. */
export function sitemapText(body: Buffer): string {
  const gzipped = body.length > 2 && body[0] === 0x1f && body[1] === 0x8b;
  const data = gzipped ? gunzipSync(body, { maxOutputLength: MAX_SITEMAP_BYTES }) : body;
  return data.toString("utf8");
}

export function parseSitemap(xml: string): ParsedSitemap {
  const $ = load(xml, { xml: true });
  const locs = (selector: string) =>
    $(selector)
      .map((_, element) => $(element).text().trim())
      .get()
      .filter((value: string) => value.length > 0);
  if ($("sitemapindex").length > 0) {
    return { kind: "sitemapindex", locations: locs("sitemapindex > sitemap > loc") };
  }
  if ($("urlset").length > 0) return { kind: "urlset", locations: locs("urlset > url > loc") };
  return { kind: "invalid", locations: [] };
}
