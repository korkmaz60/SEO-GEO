import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { seed } = await req.json();
    if (!seed) return NextResponse.json({ error: "Seed keyword zorunlu" }, { status: 400 });

    const suggestions: Array<{ keyword: string; volume: number | null; difficulty: number | null; cpc: number | null; competition: string | null }> = [];

    // DataForSEO ile gerçek keyword önerileri
    if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
      try {
        const auth = "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");

        // Related keywords
        const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live", {
          method: "POST",
          headers: { "Authorization": auth, "Content-Type": "application/json" },
          body: JSON.stringify([{
            keywords: [seed],
            location_code: 2792,
            language_code: "tr",
            include_seed_keyword: true,
            sort_by: "search_volume",
          }]),
        });

        if (res.ok) {
          const data = await res.json();
          const results = data?.tasks?.[0]?.result || [];
          for (const item of results.slice(0, 50)) {
            suggestions.push({
              keyword: item.keyword,
              volume: item.search_volume ?? null,
              difficulty: item.competition_index ? Math.round(item.competition_index * 100) : null,
              cpc: item.cpc ?? null,
              competition: item.competition ?? null,
            });
          }
        }
      } catch (e) {
        console.error("DataForSEO keyword discovery error:", e);
      }
    }

    // SerpAPI ile "related searches" ve "people also ask"
    if (suggestions.length === 0 && process.env.SERPAPI_KEY) {
      try {
        const params = new URLSearchParams({
          q: seed,
          api_key: process.env.SERPAPI_KEY,
          engine: "google",
          gl: "tr",
          hl: "tr",
        });
        const res = await fetch(`https://serpapi.com/search.json?${params}`);
        if (res.ok) {
          const data = await res.json();
          // Related searches
          for (const item of (data.related_searches || []).slice(0, 15)) {
            suggestions.push({ keyword: item.query, volume: null, difficulty: null, cpc: null, competition: null });
          }
          // People Also Ask
          for (const item of (data.related_questions || []).slice(0, 10)) {
            suggestions.push({ keyword: item.question, volume: null, difficulty: null, cpc: null, competition: null });
          }
        }
      } catch (e) {
        console.error("SerpAPI keyword discovery error:", e);
      }
    }

    // Mevcut keyword'lerden pattern-based öneriler (fallback)
    if (suggestions.length === 0) {
      const prefixes = ["en iyi", "nasıl", "nedir", "ne kadar", "neden"];
      const suffixes = ["fiyat", "karşılaştırma", "alternatifleri", "avantajları", "dezavantajları", "rehber", "örnekleri"];
      for (const prefix of prefixes) {
        suggestions.push({ keyword: `${prefix} ${seed}`, volume: null, difficulty: null, cpc: null, competition: null });
      }
      for (const suffix of suffixes) {
        suggestions.push({ keyword: `${seed} ${suffix}`, volume: null, difficulty: null, cpc: null, competition: null });
      }
    }

    // Mevcut keyword'leri filtrele
    const existingKeywords = await db.keyword.findMany({
      where: { projectId: ctx.projectId },
      select: { keyword: true },
    });
    const existingSet = new Set(existingKeywords.map(k => k.keyword.toLowerCase()));
    const filtered = suggestions.filter(s => !existingSet.has(s.keyword.toLowerCase()));

    return NextResponse.json({
      seed,
      suggestions: filtered,
      total: filtered.length,
      source: suggestions.length > 0 && process.env.DATAFORSEO_LOGIN ? "dataforseo" : process.env.SERPAPI_KEY ? "serpapi" : "local",
    });
  } catch (error) {
    console.error("Keyword discover error:", error);
    return NextResponse.json({ error: "Keyword keşfi başarısız" }, { status: 500 });
  }
}
