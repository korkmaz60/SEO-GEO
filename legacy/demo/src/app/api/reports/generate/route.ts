import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { type = "FULL", name } = await req.json();

    // Rapor kaydı oluştur
    const report = await db.report.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        name: name || `${type} Rapor — ${new Date().toLocaleDateString("tr-TR")}`,
        type: type as "FULL" | "GEO" | "SEO" | "TECHNICAL" | "COMPETITOR" | "WEEKLY_SUMMARY",
        status: "GENERATING",
      },
    });

    // Tüm verileri paralel çek
    const [latestSeo, latestGeo, keywords, latestCrawl, issues, pages, competitors, citations, aiVisibility] = await Promise.all([
      db.seoScore.findFirst({ where: { projectId: ctx.projectId }, orderBy: { measuredAt: "desc" } }),
      db.geoScore.findFirst({ where: { projectId: ctx.projectId, pageId: null }, orderBy: { measuredAt: "desc" } }),
      db.keyword.findMany({ where: { projectId: ctx.projectId }, orderBy: { position: "asc" }, take: 50 }),
      db.crawlSession.findFirst({ where: { projectId: ctx.projectId }, orderBy: { startedAt: "desc" } }),
      db.technicalIssue.findMany({ where: { crawl: { projectId: ctx.projectId } }, orderBy: { severity: "asc" }, take: 50 }),
      db.page.findMany({ where: { projectId: ctx.projectId, status: "ACTIVE" }, take: 100 }),
      db.competitor.findMany({ where: { projectId: ctx.projectId } }),
      db.citation.count({ where: { page: { projectId: ctx.projectId } } }),
      db.aiVisibility.findMany({ where: { projectId: ctx.projectId }, orderBy: { measuredAt: "desc" }, distinct: ["platform"] }),
    ]);

    const seoScore = Math.round(latestSeo?.overallScore ?? 0);
    const geoScore = Math.round(latestGeo?.overallScore ?? 0);
    const unifiedScore = Math.round(seoScore * 0.45 + geoScore * 0.45 + (latestSeo?.healthScore ?? 0) * 0.10);

    // Rapor verisini oluştur
    const reportData = {
      project: { name: ctx.project.name, domain: ctx.project.domain },
      generatedAt: new Date().toISOString(),
      scores: {
        unified: unifiedScore,
        seo: seoScore,
        geo: geoScore,
        health: Math.round(latestSeo?.healthScore ?? 0),
        speedMobile: Math.round(latestSeo?.speedMobile ?? 0),
        speedDesktop: Math.round(latestSeo?.speedDesktop ?? 0),
      },
      geoBreakdown: latestGeo ? {
        authority: Math.round(latestGeo.authorityScore),
        readability: Math.round(latestGeo.readabilityScore),
        structure: Math.round(latestGeo.structureScore),
        technical: Math.round(latestGeo.technicalScore),
      } : null,
      keywords: keywords.map(kw => ({
        keyword: kw.keyword,
        position: kw.position,
        prevPosition: kw.prevPosition,
        volume: kw.volume,
        difficulty: kw.difficulty,
        trend: kw.trend,
      })),
      crawl: latestCrawl ? {
        pagesScanned: latestCrawl.pagesScanned,
        issuesFound: latestCrawl.issuesFound,
        date: latestCrawl.finishedAt?.toISOString(),
      } : null,
      issues: issues.map(i => ({
        category: i.category,
        severity: i.severity,
        message: i.message,
      })),
      pages: {
        total: pages.length,
        indexed: pages.filter(p => p.indexed).length,
      },
      competitors: competitors.map(c => ({
        name: c.name,
        domain: c.domain,
        seoScore: Math.round(c.seoScore ?? 0),
        geoScore: Math.round(c.geoScore ?? 0),
      })),
      aiVisibility: {
        totalCitations: citations,
        platforms: aiVisibility.map(v => ({
          platform: v.platform,
          visibility: Math.round(v.visibility),
          citations: v.citations,
        })),
      },
    };

    // Raporu güncelle
    await db.report.update({
      where: { id: report.id },
      data: {
        status: "READY",
        fileSize: `${Math.round(JSON.stringify(reportData).length / 1024)}KB`,
      },
    });

    // Activity log
    await db.activityLog.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        action: "report_generated",
        details: `${type} rapor oluşturuldu`,
      },
    });

    return NextResponse.json({ report: { id: report.id, status: "READY" }, data: reportData });
  } catch (error) {
    console.error("Report generate error:", error);
    return NextResponse.json({ error: "Rapor oluşturulamadı" }, { status: 500 });
  }
}
