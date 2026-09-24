import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

/**
 * Keyword Fırsatları API
 *
 * 3 kaynaktan keyword önerisi toplar:
 * 1. Google Autocomplete — kullanıcıların gerçek zamanlı aradığı trend kelimeler
 * 2. Related Searches + People Also Ask — Google'ın önerdiği ilgili sorgular
 * 3. Rakip Analizi — rakiplerin sıralandığı ama bizim sıralanmadığımız kelimeler
 *
 * Her öneri için tahmini volume ve difficulty üretir (organic result sayısından).
 */

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const seeds: string[] = body.seeds || [];
    const languages: string[] = body.languages || ["tr", "en"];

    const domain = ctx.project.domain;

    // Mevcut keyword'leri al (duplicate kontrolü için)
    const existingKeywords = await db.keyword.findMany({
      where: { projectId: ctx.projectId },
      select: { keyword: true },
    });
    const existingSet = new Set(existingKeywords.map((k) => k.keyword.toLowerCase()));

    // Seed keyword yoksa: site title, sayfa title'ları ve mevcut keyword'lerden üret
    if (seeds.length === 0) {
      const pages = await db.page.findMany({
        where: { projectId: ctx.projectId, status: "ACTIVE" },
        select: { title: true, url: true },
        take: 10,
      });

      // Sayfa title ve URL'lerinden seed çıkar
      for (const page of pages) {
        // Title URL path'i değilse (gerçek title) onu kullan
        if (page.title && !page.title.startsWith("/") && page.title.length > 3) {
          const clean = page.title
            .split(/[-|–—]/)[0]
            .trim()
            .toLowerCase();
          if (clean.length > 3 && clean.length < 80) seeds.push(clean);
        }
        // Blog URL'lerinden keyword çıkar (slug → okunabilir keyword)
        if (page.url.includes("/blog/")) {
          const slug = page.url.split("/blog/")[1]?.replace(/\/$/, "");
          if (slug) {
            const keyword = slug.replace(/-/g, " ").toLowerCase();
            if (keyword.length > 3 && keyword.length < 60) seeds.push(keyword);
          }
        }
      }

      // Mevcut keyword'lerden seed
      for (const kw of existingKeywords.slice(0, 5)) {
        if (!seeds.includes(kw.keyword.toLowerCase())) {
          seeds.push(kw.keyword.toLowerCase());
        }
      }

      // Domain adından seed
      const domainName = domain.replace(/\.(com|net|org|io|app|dev|co)$/i, "");
      if (!seeds.some((s) => s.includes(domainName))) {
        seeds.push(domainName);
      }
    }

    if (seeds.length === 0) {
      return NextResponse.json({ error: "Seed keyword bulunamadı. En az bir keyword ekleyin veya site analizi yapın." }, { status: 400 });
    }

    const SERPAPI_KEY = process.env.SERPAPI_KEY;
    if (!SERPAPI_KEY) {
      return NextResponse.json({ error: "SerpAPI yapılandırılmamış" }, { status: 400 });
    }

    interface Suggestion {
      keyword: string;
      source: "autocomplete" | "related" | "paa" | "competitor_gap";
      volume: number | null;
      difficulty: number | null;
      totalResults: number | null;
      opportunity: "high" | "medium" | "low";
      reason: string;
      lang: string;
    }

    const langConfig: Record<string, { gl: string; hl: string; label: string }> = {
      tr: { gl: "tr", hl: "tr", label: "Türkçe" },
      en: { gl: "us", hl: "en", label: "English" },
      de: { gl: "de", hl: "de", label: "Deutsch" },
      fr: { gl: "fr", hl: "fr", label: "Français" },
      es: { gl: "es", hl: "es", label: "Español" },
    };

    const suggestions: Suggestion[] = [];
    const seen = new Set<string>();

    function addSuggestion(s: Suggestion) {
      const key = s.keyword.toLowerCase().trim();
      if (key.length < 3) return;
      if (seen.has(key) || existingSet.has(key)) return;
      seen.add(key);
      suggestions.push({ ...s, keyword: s.keyword.trim() });
    }

    // Sadece ilk 3 seed ile çalış (API limitleri)
    const activeSeeds = seeds.slice(0, 3);

    // ========== 1. GOOGLE AUTOCOMPLETE (Multi-Language) ==========
    for (const lang of languages) {
      const lc = langConfig[lang] || langConfig.en;
      for (const seed of activeSeeds) {
        try {
          const params = new URLSearchParams({
            q: seed,
            api_key: SERPAPI_KEY,
            engine: "google_autocomplete",
            gl: lc.gl,
            hl: lc.hl,
          });
          const res = await fetch(`https://serpapi.com/search.json?${params}`);
          if (res.ok) {
            const data = await res.json();
            for (const item of (data.suggestions || []).slice(0, 8)) {
              const value = item.value || item.suggestion || "";
              if (value) {
                addSuggestion({
                  keyword: value,
                  source: "autocomplete",
                  volume: null,
                  difficulty: null,
                  totalResults: null,
                  opportunity: "high",
                  reason: `Google Autocomplete (${lc.label}) — kullanıcılar aktif olarak arıyor`,
                  lang,
                });
              }
            }
          }
        } catch { /* devam */ }
      }
    }

    // ========== 2. RELATED SEARCHES + PEOPLE ALSO ASK (Multi-Language) ==========
    for (const lang of languages) {
      const lc = langConfig[lang] || langConfig.en;
      for (const seed of activeSeeds) {
        try {
          const params = new URLSearchParams({
            q: seed,
            api_key: SERPAPI_KEY,
            engine: "google",
            gl: lc.gl,
            hl: lc.hl,
            num: "10",
          });
          const res = await fetch(`https://serpapi.com/search.json?${params}`);
          if (res.ok) {
            const data = await res.json();

            // Related Searches
            for (const item of (data.related_searches || []).slice(0, 8)) {
              if (item.query) {
                addSuggestion({
                  keyword: item.query,
                  source: "related",
                  volume: null,
                  difficulty: null,
                  totalResults: data.search_information?.total_results ?? null,
                  opportunity: "medium",
                  reason: `Google İlişkili Arama (${lc.label})`,
                  lang,
                });
              }
            }

            // People Also Ask
            for (const item of (data.related_questions || []).slice(0, 6)) {
              if (item.question) {
                addSuggestion({
                  keyword: item.question,
                  source: "paa",
                  volume: null,
                  difficulty: null,
                  totalResults: null,
                  opportunity: "high",
                  reason: `People Also Ask (${lc.label}) — featured snippet fırsatı`,
                  lang,
                });
              }
            }
          }
        } catch { /* devam */ }
      }
    }

    // ========== 3. RAKİP ANALİZİ (Competitor Keyword Gap) ==========
    const competitors = await db.competitor.findMany({
      where: { projectId: ctx.projectId },
      select: { domain: true, name: true },
      take: 3,
    });

    if (competitors.length > 0) {
      for (const comp of competitors.slice(0, 2)) {
        // Rakibi hem TR hem EN'de tara
        for (const lang of languages.slice(0, 2)) {
          const lc = langConfig[lang] || langConfig.en;
          try {
            const params = new URLSearchParams({
              q: `site:${comp.domain}`,
              api_key: SERPAPI_KEY,
              engine: "google",
              gl: lc.gl,
              hl: lc.hl,
              num: "20",
            });
            const res = await fetch(`https://serpapi.com/search.json?${params}`);
            if (res.ok) {
              const data = await res.json();
              for (const result of (data.organic_results || []).slice(0, 10)) {
                const title = result.title || "";
                const words = title
                  .split(/[-|–—:]/)[0]
                  .trim()
                  .toLowerCase();
                if (words.length > 5 && words.length < 60) {
                  addSuggestion({
                    keyword: words,
                    source: "competitor_gap",
                    volume: null,
                    difficulty: null,
                    totalResults: null,
                    opportunity: "high",
                    reason: `${comp.name} (${comp.domain}) bu konuda sıralanıyor (${lc.label})`,
                    lang,
                  });
                }
              }
            }
          } catch { /* devam */ }
        }
      }
    }

    // ========== VOLUME & DIFFICULTY TAHMİNİ ==========
    // İlk 15 öneri için Google arama sonuç sayısından tahmin
    const toEstimate = suggestions.slice(0, 15);
    for (const s of toEstimate) {
      if (s.totalResults) {
        s.volume = estimateVolume(s.totalResults);
        s.difficulty = estimateDifficulty(s.totalResults);
        continue;
      }
      try {
        const lc = langConfig[s.lang] || langConfig.en;
        const params = new URLSearchParams({
          q: s.keyword,
          api_key: SERPAPI_KEY,
          engine: "google",
          gl: lc.gl,
          hl: lc.hl,
          num: "1",
        });
        const res = await fetch(`https://serpapi.com/search.json?${params}`);
        if (res.ok) {
          const data = await res.json();
          const total = data.search_information?.total_results ?? 0;
          s.totalResults = total;
          s.volume = estimateVolume(total);
          s.difficulty = estimateDifficulty(total);

          // Eğer domain bu kelimede sıralanmıyorsa fırsat yüksek
          const organic = data.organic_results || [];
          const domainFound = organic.some((r: { link?: string }) => r.link?.includes(domain));
          if (!domainFound && s.opportunity !== "high") {
            s.opportunity = "high";
            s.reason += " — henüz sıralanmıyorsunuz";
          }
        }
      } catch { /* devam */ }
    }

    // Fırsat seviyesine ve tahmini volume'e göre sırala
    const opportunityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => {
      const oaDiff = opportunityOrder[a.opportunity] - opportunityOrder[b.opportunity];
      if (oaDiff !== 0) return oaDiff;
      return (b.volume ?? 0) - (a.volume ?? 0);
    });

    return NextResponse.json({
      domain,
      seeds: activeSeeds,
      languages,
      suggestions: suggestions.slice(0, 60),
      total: suggestions.length,
      sources: {
        autocomplete: suggestions.filter((s) => s.source === "autocomplete").length,
        related: suggestions.filter((s) => s.source === "related").length,
        paa: suggestions.filter((s) => s.source === "paa").length,
        competitor_gap: suggestions.filter((s) => s.source === "competitor_gap").length,
      },
      byLang: Object.fromEntries(
        languages.map((l) => [l, suggestions.filter((s) => s.lang === l).length])
      ),
    });
  } catch (error) {
    console.error("Keyword opportunities error:", error);
    return NextResponse.json({ error: "Fırsat analizi başarısız" }, { status: 500 });
  }
}

// Google sonuç sayısından tahmini aylık arama hacmi
function estimateVolume(totalResults: number): number {
  if (totalResults >= 1_000_000_000) return 50000;
  if (totalResults >= 500_000_000) return 30000;
  if (totalResults >= 100_000_000) return 10000;
  if (totalResults >= 50_000_000) return 5000;
  if (totalResults >= 10_000_000) return 2000;
  if (totalResults >= 5_000_000) return 1000;
  if (totalResults >= 1_000_000) return 500;
  if (totalResults >= 500_000) return 200;
  if (totalResults >= 100_000) return 100;
  return 50;
}

// Google sonuç sayısından tahmini zorluk (0-100)
function estimateDifficulty(totalResults: number): number {
  if (totalResults >= 1_000_000_000) return 90;
  if (totalResults >= 500_000_000) return 80;
  if (totalResults >= 100_000_000) return 70;
  if (totalResults >= 50_000_000) return 60;
  if (totalResults >= 10_000_000) return 50;
  if (totalResults >= 5_000_000) return 40;
  if (totalResults >= 1_000_000) return 30;
  if (totalResults >= 100_000) return 20;
  return 15;
}
