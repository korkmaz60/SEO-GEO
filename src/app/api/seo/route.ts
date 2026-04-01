import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

// SEMrush/Ahrefs tarzı CTR modeli (pozisyona göre tahmini CTR)
const CTR_MAP: Record<number, number> = {
  1: 0.316, 2: 0.142, 3: 0.098, 4: 0.074, 5: 0.053,
  6: 0.038, 7: 0.029, 8: 0.022, 9: 0.018, 10: 0.016,
};

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({
      score: null, keywords: [], crawl: null, issues: [], trend: [],
      organicTraffic: null, positionDistribution: null, indexing: { totalPages: 0, indexedPages: 0, indexRate: 0 },
      issueSummary: { critical: 0, warning: 0, notice: 0, info: 0 },
    });
    const { projectId } = ctx;

    const [
      latestSeo,
      prevSeo,
      trackedKeywords,
      allKeywordsWithPosition,
      organicKeywords,
      latestCrawl,
      technicalIssues,
      seoTrend,
      totalPages,
      indexedPages,
      latestBacklink,
    ] = await Promise.all([
      db.seoScore.findFirst({ where: { projectId }, orderBy: { measuredAt: "desc" } }),
      db.seoScore.findFirst({ where: { projectId }, orderBy: { measuredAt: "desc" }, skip: 1 }),
      db.keyword.findMany({
        where: { projectId, tracked: true },
        orderBy: [{ position: { sort: "asc", nulls: "last" } }, { keyword: "asc" }],
      }),
      // Pozisyon dağılımı için tüm pozisyonlu keyword'ler
      db.keyword.findMany({
        where: { projectId, position: { not: null } },
        select: { position: true, volume: true, clicks: true, impressions: true, tracked: true },
      }),
      // GSC organik trafik özeti
      db.keyword.aggregate({
        where: { projectId, source: "GOOGLE_SEARCH_CONSOLE" },
        _sum: { clicks: true, impressions: true },
        _count: true,
        _avg: { position: true, ctr: true },
      }),
      db.crawlSession.findFirst({ where: { projectId }, orderBy: { startedAt: "desc" } }),
      db.technicalIssue.findMany({ where: { crawl: { projectId } }, orderBy: { severity: "asc" } }),
      db.seoScore.findMany({ where: { projectId }, orderBy: { measuredAt: "asc" }, take: 12 }),
      db.page.count({ where: { projectId, status: "ACTIVE" } }),
      db.page.count({ where: { projectId, status: "ACTIVE", indexed: true } }),
      db.backlinkSnapshot.findFirst({ where: { projectId }, orderBy: { measuredAt: "desc" } }),
    ]);

    // ========== POZISYON DAĞILIMI ==========
    const top3 = allKeywordsWithPosition.filter(k => k.position! <= 3).length;
    const top10 = allKeywordsWithPosition.filter(k => k.position! <= 10).length;
    const top20 = allKeywordsWithPosition.filter(k => k.position! <= 20).length;
    const top50 = allKeywordsWithPosition.filter(k => k.position! <= 50).length;
    const top100 = allKeywordsWithPosition.length;

    // ========== SEO VISIBILITY (SEMrush formülü) ==========
    let visibilityScore = 0;
    let estimatedTraffic = 0;
    for (const kw of allKeywordsWithPosition) {
      const pos = kw.position!;
      const vol = kw.volume ?? 1;
      const ctr = pos <= 10 ? (CTR_MAP[pos] ?? 0.016) : pos <= 20 ? 0.005 : pos <= 50 ? 0.001 : 0;
      visibilityScore += ctr * vol;
      estimatedTraffic += (kw.volume ?? 0) * ctr;
    }
    estimatedTraffic = Math.round(estimatedTraffic);

    // ========== ORGANİK TRAFİK ÖZETİ (GSC) ==========
    const organicTraffic = {
      totalClicks: organicKeywords._sum.clicks ?? 0,
      totalImpressions: organicKeywords._sum.impressions ?? 0,
      totalQueries: organicKeywords._count,
      avgPosition: organicKeywords._avg.position ? Number(organicKeywords._avg.position.toFixed(1)) : null,
      avgCtr: organicKeywords._avg.ctr ? Number(organicKeywords._avg.ctr.toFixed(2)) : null,
      estimatedMonthlyTraffic: estimatedTraffic,
    };

    // ========== SKOR DEĞİŞİMİ ==========
    const scoreChange = prevSeo
      ? Number((latestSeo!.overallScore - prevSeo.overallScore).toFixed(1))
      : null;

    // ========== ISSUE GRUPLAMA ==========
    const issuesByCategory = technicalIssues.reduce(
      (acc, issue) => {
        if (!acc[issue.category]) {
          acc[issue.category] = { count: 0, severity: issue.severity, messages: [] };
        }
        acc[issue.category].count++;
        acc[issue.category].messages.push(issue.message);
        return acc;
      },
      {} as Record<string, { count: number; severity: string; messages: string[] }>
    );

    const issueSummary = {
      critical: technicalIssues.filter(i => i.severity === "CRITICAL").length,
      warning: technicalIssues.filter(i => i.severity === "WARNING").length,
      notice: technicalIssues.filter(i => i.severity === "NOTICE").length,
      info: technicalIssues.filter(i => i.severity === "INFO").length,
    };

    return NextResponse.json({
      score: latestSeo
        ? {
            overall: Math.round(latestSeo.overallScore),
            health: Math.round(latestSeo.healthScore ?? 0),
            speedMobile: Math.round(latestSeo.speedMobile ?? 0),
            speedDesktop: Math.round(latestSeo.speedDesktop ?? 0),
            scoreChange,
            coreWebVitals: {
              lcp: {
                value: latestSeo.lcpValue,
                status: (latestSeo.lcpValue ?? 3) <= 2.5 ? "good" : (latestSeo.lcpValue ?? 3) <= 4 ? "needs-improvement" : "poor",
              },
              inp: {
                value: latestSeo.fidValue,
                status: (latestSeo.fidValue ?? 300) <= 200 ? "good" : (latestSeo.fidValue ?? 300) <= 500 ? "needs-improvement" : "poor",
              },
              cls: {
                value: latestSeo.clsValue,
                status: (latestSeo.clsValue ?? 0.2) <= 0.1 ? "good" : (latestSeo.clsValue ?? 0.2) <= 0.25 ? "needs-improvement" : "poor",
              },
            },
          }
        : null,

      // Organik trafik metrikleri (Ahrefs tarzı)
      organicTraffic,
      visibilityScore: Math.round(visibilityScore * 100) / 100,

      // Pozisyon dağılımı (SEMrush tarzı)
      positionDistribution: {
        top3,
        top10,
        top20,
        top50,
        top100,
        total: allKeywordsWithPosition.length,
      },

      // Backlink özeti
      backlinks: latestBacklink ? {
        total: latestBacklink.totalBacklinks,
        referringDomains: latestBacklink.referringDomains,
        domainRank: latestBacklink.domainRank,
      } : null,

      // Tracked keyword'ler
      keywords: trackedKeywords.map((kw) => ({
        id: kw.id,
        keyword: kw.keyword,
        position: kw.position,
        prevPosition: kw.prevPosition,
        volume: kw.volume,
        clicks: kw.clicks,
        impressions: kw.impressions,
        ctr: kw.ctr,
        difficulty: kw.difficulty,
        geoScore: kw.geoScore,
        trend: kw.trend.toLowerCase(),
        source: kw.source.toLowerCase(),
      })),

      crawl: latestCrawl
        ? {
            pagesScanned: latestCrawl.pagesScanned,
            issuesFound: latestCrawl.issuesFound,
            status: latestCrawl.status,
            finishedAt: latestCrawl.finishedAt?.toISOString(),
          }
        : null,

      indexing: {
        totalPages,
        indexedPages,
        indexRate: totalPages > 0 ? Math.round((indexedPages / totalPages) * 100) : 0,
      },
      issueSummary,
      issues: Object.entries(issuesByCategory).map(([category, data]) => ({
        category,
        count: data.count,
        severity: data.severity.toLowerCase(),
        message: data.messages[0],
      })),
      trend: seoTrend.map((s, i) => ({
        week: `Hft ${i + 1}`,
        score: Math.round(s.overallScore),
        health: Math.round(s.healthScore ?? 0),
      })),
    });
  } catch (error) {
    console.error("SEO API error:", error);
    return NextResponse.json({ error: "Veriler yüklenirken hata oluştu" }, { status: 500 });
  }
}
