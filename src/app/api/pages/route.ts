import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ pages: [], stats: { total: 0, indexed: 0, sitemap: 0, internalLink: 0, searchConsole: 0 } });

    const pages = await db.page.findMany({
      where: { projectId: ctx.projectId, status: "ACTIVE" },
      orderBy: { url: "asc" },
      include: {
        geoScores: { orderBy: { measuredAt: "desc" }, take: 1 },
      },
    });

    const stats = {
      total: pages.length,
      indexed: pages.filter((p) => p.indexed).length,
      sitemap: pages.filter((p) => p.source === "SITEMAP").length,
      internalLink: pages.filter((p) => p.source === "INTERNAL_LINK").length,
      searchConsole: pages.filter((p) => p.source === "SEARCH_CONSOLE").length,
      llmsTxt: pages.filter((p) => p.source === "LLMS_TXT").length,
    };

    return NextResponse.json({
      domain: ctx.project.domain,
      pages: pages.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.title,
        wordCount: p.wordCount,
        source: p.source.toLowerCase().replace("_", "-"),
        indexed: p.indexed,
        lastCrawl: p.lastCrawl?.toISOString(),
        geoScore: p.geoScores[0]?.overallScore ? Math.round(p.geoScores[0].overallScore) : null,
      })),
      stats,
    });
  } catch (error) {
    console.error("Pages API error:", error);
    return NextResponse.json({ error: "Sayfalar yüklenemedi" }, { status: 500 });
  }
}
