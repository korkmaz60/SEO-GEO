import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "28");
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({
      overview: { unifiedScore: 0, geoScore: 0, seoScore: 0, totalKeywords: 0, aiVisibility: 0, citationCount: 0, indexedPages: 0, backlinks: 0, trafficChange: 0 },
      geoBreakdown: null, aiPlatforms: [], trends: [], alerts: [], noProject: true,
    });
    const { projectId } = ctx;

    const [
      latestGeo,
      latestSeo,
      totalKeywords,
      totalCitations,
      totalPages,
      indexedPages,
      latestAlerts,
      aiVisibilityLatest,
      geoTrend,
      seoTrend,
      latestCrawl,
      rankedKeywords,
    ] = await Promise.all([
      db.geoScore.findFirst({ where: { projectId, pageId: null }, orderBy: { measuredAt: "desc" } }),
      db.seoScore.findFirst({ where: { projectId }, orderBy: { measuredAt: "desc" } }),
      db.keyword.count({ where: { projectId } }),
      db.citation.count({ where: { page: { projectId } } }),
      db.page.count({ where: { projectId, status: "ACTIVE" } }),
      db.page.count({ where: { projectId, status: "ACTIVE", indexed: true } }),
      db.alert.findMany({ where: { projectId, createdAt: { gte: sinceDate } }, orderBy: { createdAt: "desc" }, take: 10 }),
      db.aiVisibility.findMany({ where: { projectId }, orderBy: { measuredAt: "desc" }, distinct: ["platform"] }),
      // Trend verileri — sinceDate filtresini uygula
      db.geoScore.findMany({ where: { projectId, pageId: null, measuredAt: { gte: sinceDate } }, orderBy: { measuredAt: "asc" }, take: 12 }),
      db.seoScore.findMany({ where: { projectId, measuredAt: { gte: sinceDate } }, orderBy: { measuredAt: "asc" }, take: 12 }),
      db.crawlSession.findFirst({ where: { projectId }, orderBy: { startedAt: "desc" } }),
      db.keyword.findMany({ where: { projectId, position: { not: null } }, select: { position: true, volume: true } }),
    ]);

    // Backlink verisi — önce BacklinkSnapshot tablosundan oku (cache)
    let backlinks = 0;
    const latestBacklink = await db.backlinkSnapshot.findFirst({
      where: { projectId },
      orderBy: { measuredAt: "desc" },
    });
    if (latestBacklink) {
      backlinks = latestBacklink.totalBacklinks;
    }

    const geoScore = latestGeo?.overallScore ?? 0;
    const seoScore = latestSeo?.overallScore ?? 0;
    const healthScore = latestSeo?.healthScore ?? 0;
    const unifiedScore = Math.round(seoScore * 0.45 + geoScore * 0.45 + healthScore * 0.10);

    // SEO Visibility (SEMrush tarzı — keyword pozisyonlarından)
    const CTR_MAP: Record<number, number> = {
      1: 0.316, 2: 0.142, 3: 0.098, 4: 0.074, 5: 0.053,
      6: 0.038, 7: 0.029, 8: 0.022, 9: 0.018, 10: 0.016,
    };
    let weightedCTR = 0;
    let totalVol = 0;
    for (const kw of rankedKeywords) {
      const pos = kw.position!;
      const vol = kw.volume ?? 1;
      const ctr = pos <= 10 ? (CTR_MAP[pos] ?? 0.016) : pos <= 20 ? 0.005 : pos <= 50 ? 0.001 : 0;
      weightedCTR += ctr * vol;
      totalVol += vol;
    }
    const seoVisibility = totalVol > 0 ? Math.round((weightedCTR / totalVol) * 100 * 100) / 100 : 0;
    const estimatedTraffic = Math.round(rankedKeywords.reduce((sum, kw) => {
      const pos = kw.position!;
      const vol = kw.volume ?? 0;
      const ctr = pos <= 10 ? (CTR_MAP[pos] ?? 0.016) : pos <= 20 ? 0.005 : 0;
      return sum + vol * ctr;
    }, 0));

    const avgVisibility =
      aiVisibilityLatest.length > 0
        ? Math.round(aiVisibilityLatest.reduce((sum, v) => sum + v.visibility, 0) / aiVisibilityLatest.length)
        : 0;

    // Trafik değişimi — GSC clicks varsa onu kullan, yoksa SEO skor farkı
    let trafficChange = 0;
    if (seoTrend.length >= 2) {
      const latest = seoTrend[seoTrend.length - 1];
      const prev = seoTrend[seoTrend.length - 2];
      if (prev.overallScore > 0) {
        trafficChange = Number(((latest.overallScore - prev.overallScore) / prev.overallScore * 100).toFixed(1));
      }
    }

    return NextResponse.json({
      project: {
        name: ctx.project.name,
        domain: ctx.project.domain,
      },
      overview: {
        unifiedScore,
        geoScore: Math.round(geoScore),
        seoScore: Math.round(seoScore),
        healthScore: Math.round(healthScore),
        totalKeywords,
        aiVisibility: avgVisibility,
        citationCount: totalCitations,
        indexedPages,
        totalPages,
        backlinks,
        trafficChange,
        seoVisibility,
        estimatedTraffic,
        lastCrawl: latestCrawl ? {
          pagesScanned: latestCrawl.pagesScanned,
          issuesFound: latestCrawl.issuesFound,
          date: latestCrawl.finishedAt?.toISOString(),
        } : null,
      },
      geoBreakdown: latestGeo
        ? {
            authority: Math.round(latestGeo.authorityScore),
            readability: Math.round(latestGeo.readabilityScore),
            structure: Math.round(latestGeo.structureScore),
            technical: Math.round(latestGeo.technicalScore),
          }
        : null,
      seoBreakdown: latestSeo
        ? {
            speedMobile: Math.round(latestSeo.speedMobile ?? 0),
            speedDesktop: Math.round(latestSeo.speedDesktop ?? 0),
            health: Math.round(latestSeo.healthScore ?? 0),
            lcp: latestSeo.lcpValue,
            inp: latestSeo.fidValue,
            cls: latestSeo.clsValue,
          }
        : null,
      aiPlatforms: aiVisibilityLatest.map((v) => ({
        platform: v.platform,
        visibility: Math.round(v.visibility),
        citations: v.citations,
        change: Number(v.change.toFixed(1)),
      })),
      trends: geoTrend.map((g, i) => ({
        week: `Hft ${i + 1}`,
        geo: Math.round(g.overallScore),
        seo: Math.round(seoTrend[i]?.overallScore ?? 0),
      })),
      alerts: latestAlerts.map((a) => ({
        type: a.type.toLowerCase(),
        message: a.message,
        time: formatTimeAgo(a.createdAt),
        read: a.read,
      })),
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json({ error: "Veriler yüklenirken hata oluştu" }, { status: 500 });
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} gün önce`;
  if (hours > 0) return `${hours} saat önce`;
  if (minutes > 0) return `${minutes} dakika önce`;
  return "Az önce";
}
