import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

/**
 * AI Visibility Check — GERÇEK platform verisiyle Citation ve AiVisibility tablolarını doldurur.
 *
 * Veri Kaynakları (öncelik sırasıyla):
 * 1. SerpAPI → Google AI Overview (gerçek Google sonucu)
 * 2. Perplexity API → Perplexity citations (gerçek Perplexity sonucu)
 * 3. AI Provider → ChatGPT/Claude simülasyonu (fallback)
 *
 * POST: Visibility kontrolü çalıştır
 * GET: Son verileri döndür
 */

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const customQueries: string[] = body.queries || [];
    const maxQueries = body.maxQueries || 5;
    const domain = ctx.project.domain;

    // Sorgu listesi — keyword'lerden veya özel sorgulardan
    let queries: string[] = customQueries;
    if (queries.length === 0) {
      const topKeywords = await db.keyword.findMany({
        where: { projectId: ctx.projectId, position: { not: null } },
        orderBy: { position: "asc" },
        take: maxQueries,
      });
      queries = topKeywords.length > 0
        ? topKeywords.map(kw => kw.keyword)
        : [`${domain} hakkında bilgi`, `${domain} ne işe yarar`, `${domain} alternatifleri`];
    }

    const selectedQueries = queries.slice(0, maxQueries);

    // Platform sonuçları
    const platformResults: Record<string, {
      mentions: number;
      total: number;
      citations: Array<{ query: string; snippet: string | null; position: number | null; url?: string }>;
      source: string;
    }> = {
      GOOGLE_AI_OVERVIEW: { mentions: 0, total: 0, citations: [], source: "serpapi" },
      PERPLEXITY: { mentions: 0, total: 0, citations: [], source: "perplexity-api" },
      CHATGPT: { mentions: 0, total: 0, citations: [], source: "openai-api" },
      CLAUDE: { mentions: 0, total: 0, citations: [], source: "anthropic-api" },
    };

    // ========== 1. GOOGLE AI OVERVIEW (SerpAPI — gerçek veri) ==========
    if (process.env.SERPAPI_KEY) {
      const { checkGoogleAiOverview } = await import("@/lib/serper");
      for (const query of selectedQueries) {
        try {
          const result = await checkGoogleAiOverview(query, domain);
          if (result.hasAiOverview) {
            platformResults.GOOGLE_AI_OVERVIEW.total++;
            if (result.mentioned) {
              platformResults.GOOGLE_AI_OVERVIEW.mentions++;
              platformResults.GOOGLE_AI_OVERVIEW.citations.push({
                query,
                snippet: result.snippet,
                position: result.mentionPosition,
                url: result.references.find(r => r.domain.includes(domain))?.url,
              });
            }
          }
        } catch { /* SerpAPI hatası, devam */ }
      }
    }

    // ========== 2. PERPLEXITY (Gerçek API — citation'larla) ==========
    if (process.env.PERPLEXITY_API_KEY) {
      const { checkPerplexity } = await import("@/lib/serper");
      for (const query of selectedQueries) {
        try {
          const result = await checkPerplexity(query, domain);
          if (result) {
            platformResults.PERPLEXITY.total++;
            platformResults.PERPLEXITY.source = "perplexity-api";
            if (result.mentioned) {
              platformResults.PERPLEXITY.mentions++;
              platformResults.PERPLEXITY.citations.push({
                query,
                snippet: result.snippet,
                position: result.mentionPosition,
              });
            }
          }
        } catch { /* Perplexity hatası, devam */ }
      }
    }

    // ========== 3. CHATGPT & CLAUDE SİMÜLASYONU (AI Provider fallback) ==========
    try {
      const { checkAiVisibility, getDefaultProvider } = await import("@/lib/ai");

      // ChatGPT (OpenAI API varsa)
      if (process.env.OPENAI_API_KEY) {
        for (const query of selectedQueries) {
          try {
            const result = await checkAiVisibility(query, domain, "openai");
            if (result) {
              platformResults.CHATGPT.total++;
              if (result.mentioned) {
                platformResults.CHATGPT.mentions++;
                platformResults.CHATGPT.citations.push({
                  query,
                  snippet: result.snippet,
                  position: result.position,
                });
              }
            }
          } catch { /* */ }
        }
      }

      // Claude (Anthropic API varsa)
      if (process.env.ANTHROPIC_API_KEY) {
        for (const query of selectedQueries) {
          try {
            const result = await checkAiVisibility(query, domain, "claude");
            if (result) {
              platformResults.CLAUDE.total++;
              if (result.mentioned) {
                platformResults.CLAUDE.mentions++;
                platformResults.CLAUDE.citations.push({
                  query,
                  snippet: result.snippet,
                  position: result.position,
                });
              }
            }
          } catch { /* */ }
        }
      }
    } catch { /* AI import hatası */ }

    // ========== VERİTABANI KAYITLARI ==========

    // Önceki ölçümler (change hesabı için)
    const prevVisibility = await db.aiVisibility.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { measuredAt: "desc" },
      distinct: ["platform"],
    });
    const prevMap = new Map(prevVisibility.map(v => [v.platform, v.visibility]));

    // Her platform için kaydet
    const visibilityRecords = [];
    const activePlatforms = Object.entries(platformResults).filter(([, data]) => data.total > 0);

    for (const [platformId, data] of activePlatforms) {
      const visibility = Math.round((data.mentions / data.total) * 100);
      const prevVis = prevMap.get(platformId as "GOOGLE_AI_OVERVIEW" | "CHATGPT" | "PERPLEXITY" | "CLAUDE" | "COPILOT") ?? 0;
      const change = visibility - prevVis;

      await db.aiVisibility.create({
        data: {
          projectId: ctx.projectId,
          platform: platformId as "GOOGLE_AI_OVERVIEW" | "CHATGPT" | "PERPLEXITY" | "CLAUDE" | "COPILOT",
          visibility,
          citations: data.mentions,
          change,
        },
      });

      // Citation kayıtları — sayfa bulunamazsa ana sayfaya bağla (veri kaybını önle)
      for (const citation of data.citations) {
        let relatedPage = await findRelatedPage(ctx.projectId, citation.url || null, domain);

        // Sayfa bulunamazsa ana sayfayı fallback olarak kullan
        if (!relatedPage) {
          const homePage = await db.page.findFirst({
            where: { projectId: ctx.projectId, url: "/" },
            select: { id: true },
          });
          if (homePage) {
            relatedPage = homePage.id;
          } else {
            // Ana sayfa da yoksa oluştur
            const created = await db.page.create({
              data: { projectId: ctx.projectId, url: "/", title: domain, status: "ACTIVE" },
            });
            relatedPage = created.id;
          }
        }

        const validPlatform = platformId as "GOOGLE_AI_OVERVIEW" | "CHATGPT" | "PERPLEXITY" | "CLAUDE";
        await db.citation.create({
          data: {
            pageId: relatedPage,
            platform: validPlatform,
            query: citation.query,
            snippet: citation.snippet,
            position: citation.position,
          },
        });
      }

      visibilityRecords.push({
        platform: platformId,
        visibility,
        citations: data.mentions,
        totalChecks: data.total,
        change,
        source: data.source,
        citationDetails: data.citations,
      });
    }

    // Bildirim
    const totalMentions = activePlatforms.reduce((sum, [, d]) => sum + d.mentions, 0);
    const totalChecks = activePlatforms.reduce((sum, [, d]) => sum + d.total, 0);

    const dataSources = [
      process.env.SERPAPI_KEY ? "Google AI Overview" : null,
      process.env.PERPLEXITY_API_KEY ? "Perplexity" : null,
      process.env.OPENAI_API_KEY ? "ChatGPT" : null,
      process.env.ANTHROPIC_API_KEY ? "Claude" : null,
    ].filter(Boolean);

    await db.alert.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        type: totalMentions > 0 ? "SUCCESS" : "INFO",
        message: `AI Visibility: ${totalMentions}/${totalChecks} sorguda tespit edildi (${dataSources.join(", ")})`,
      },
    });

    return NextResponse.json({
      domain,
      queriesChecked: selectedQueries,
      platforms: visibilityRecords,
      summary: {
        totalChecks,
        totalMentions,
        mentionRate: totalChecks > 0 ? Math.round((totalMentions / totalChecks) * 100) : 0,
        platformsCovered: activePlatforms.length,
        dataSources,
      },
    });
  } catch (error) {
    console.error("AI Visibility error:", error);
    return NextResponse.json({ error: "AI görünürlük testi başarısız" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ platforms: [], totalCitations: 0, recentCitations: [] });

    const [latestVisibility, totalCitations, recentCitations] = await Promise.all([
      db.aiVisibility.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { measuredAt: "desc" },
        distinct: ["platform"],
      }),
      db.citation.count({ where: { page: { projectId: ctx.projectId } } }),
      db.citation.findMany({
        where: { page: { projectId: ctx.projectId } },
        orderBy: { detectedAt: "desc" },
        take: 20,
        include: { page: { select: { url: true, title: true } } },
      }),
    ]);

    return NextResponse.json({
      platforms: latestVisibility.map(v => ({
        platform: v.platform,
        visibility: Math.round(v.visibility),
        citations: v.citations,
        change: Number(v.change.toFixed(1)),
        measuredAt: v.measuredAt.toISOString(),
      })),
      totalCitations,
      recentCitations: recentCitations.map(c => ({
        platform: c.platform,
        query: c.query,
        snippet: c.snippet,
        position: c.position,
        pageUrl: c.page.url,
        pageTitle: c.page.title,
        detectedAt: c.detectedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("AI Visibility GET error:", error);
    return NextResponse.json({ error: "Veriler yüklenirken hata oluştu" }, { status: 500 });
  }
}

// İlgili sayfayı bul — citation URL'si ile eşleşen sayfa veya fallback
async function findRelatedPage(projectId: string, citationUrl: string | null, domain: string): Promise<string | null> {
  if (citationUrl) {
    try {
      const path = new URL(citationUrl).pathname;
      const page = await db.page.findFirst({
        where: { projectId, url: path },
      });
      if (page) return page.id;
    } catch { /* */ }
  }

  // Fallback — en son crawl edilen sayfa
  const fallback = await db.page.findFirst({
    where: { projectId },
    orderBy: { lastCrawl: "desc" },
  });
  return fallback?.id || null;
}
