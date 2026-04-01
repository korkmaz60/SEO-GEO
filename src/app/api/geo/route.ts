import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ score: null, pageScores: [], platforms: [], platformTrend: [], topCitedPages: [], totalCitations: 0, checklist: [] });
    const { projectId } = ctx;

    const [
      latestGeo,
      pageGeoScores,
      aiVisibilityTrend,
      aiVisibilityLatest,
      citations,
      contentChecks,
      topCitedPages,
    ] = await Promise.all([
      // Son GEO skoru
      db.geoScore.findFirst({
        where: { projectId, pageId: null },
        orderBy: { measuredAt: "desc" },
      }),
      // Sayfa bazlı GEO skorları
      db.geoScore.findMany({
        where: { projectId, pageId: { not: null } },
        include: { page: { select: { url: true, title: true } } },
        orderBy: { overallScore: "desc" },
      }),
      // AI visibility trendi (tüm kayıtlar)
      db.aiVisibility.findMany({
        where: { projectId },
        orderBy: { measuredAt: "asc" },
      }),
      // Son AI visibility
      db.aiVisibility.findMany({
        where: { projectId },
        orderBy: { measuredAt: "desc" },
        distinct: ["platform"],
      }),
      // Tüm atıflar
      db.citation.findMany({
        where: { page: { projectId } },
        include: { page: { select: { url: true, title: true } } },
        orderBy: { detectedAt: "desc" },
      }),
      // GEO checklist — ContentCheck tablosundan
      db.contentCheck.findMany({
        where: { page: { projectId } },
        orderBy: { checkedAt: "desc" },
        select: { checkType: true, status: true, impact: true, message: true, checkedAt: true },
      }),
      // En çok atıf alan sayfalar
      db.citation.groupBy({
        by: ["pageId"],
        _count: { id: true },
        where: { page: { projectId } },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
    ]);

    // Sayfa detaylarını çek
    const pageIds = topCitedPages.map((p) => p.pageId);
    const pageDetails = await db.page.findMany({
      where: { id: { in: pageIds } },
      select: { id: true, url: true, title: true },
    });

    // Sayfa bazlı atıf platformları
    const citationsByPage = citations.reduce(
      (acc, c) => {
        if (!acc[c.pageId]) acc[c.pageId] = new Set();
        acc[c.pageId].add(c.platform);
        return acc;
      },
      {} as Record<string, Set<string>>
    );

    return NextResponse.json({
      score: latestGeo
        ? {
            overall: Math.round(latestGeo.overallScore),
            authority: Math.round(latestGeo.authorityScore),
            readability: Math.round(latestGeo.readabilityScore),
            structure: Math.round(latestGeo.structureScore),
            technical: Math.round(latestGeo.technicalScore),
          }
        : null,
      pageScores: pageGeoScores.map((g) => ({
        pageUrl: g.page?.url,
        pageTitle: g.page?.title,
        score: Math.round(g.overallScore),
        authority: Math.round(g.authorityScore),
        readability: Math.round(g.readabilityScore),
        structure: Math.round(g.structureScore),
        technical: Math.round(g.technicalScore),
      })),
      platforms: aiVisibilityLatest.map((v) => ({
        platform: v.platform,
        visibility: Math.round(v.visibility),
        citations: v.citations,
        change: Number(v.change.toFixed(1)),
      })),
      platformTrend: aiVisibilityTrend.map((v) => ({
        platform: v.platform,
        visibility: Math.round(v.visibility),
        date: v.measuredAt.toISOString(),
      })),
      topCitedPages: topCitedPages.map((p) => {
        const page = pageDetails.find((d) => d.id === p.pageId);
        const geoScore = pageGeoScores.find((g) => g.page?.url === page?.url);
        return {
          url: page?.url,
          title: page?.title,
          citations: p._count.id,
          platforms: Array.from(citationsByPage[p.pageId] || []),
          geoScore: geoScore ? Math.round(geoScore.overallScore) : null,
        };
      }),
      totalCitations: citations.length,
      checklist: contentChecks.map((c) => ({
        item: c.checkType,
        status: c.status.toLowerCase() as "pass" | "warning" | "fail",
        impact: c.impact,
        message: c.message,
        checkedAt: c.checkedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GEO API error:", error);
    return NextResponse.json({ error: "Veriler yüklenirken hata oluştu" }, { status: 500 });
  }
}
