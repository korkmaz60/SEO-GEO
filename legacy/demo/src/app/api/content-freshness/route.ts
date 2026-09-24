import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ pages: [], stats: {} });

    const pages = await db.page.findMany({
      where: { projectId: ctx.projectId, status: "ACTIVE" },
      orderBy: { lastCrawl: "asc" },
      select: { url: true, title: true, wordCount: true, lastCrawl: true, updatedAt: true, createdAt: true },
    });

    const now = new Date();
    const freshness = pages.map(p => {
      const lastUpdate = p.lastCrawl || p.updatedAt;
      const daysSinceUpdate = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      let status: "fresh" | "aging" | "stale" | "outdated";
      if (daysSinceUpdate <= 30) status = "fresh";
      else if (daysSinceUpdate <= 90) status = "aging";
      else if (daysSinceUpdate <= 180) status = "stale";
      else status = "outdated";

      return {
        url: p.url,
        title: p.title,
        wordCount: p.wordCount,
        lastUpdate: lastUpdate.toISOString(),
        daysSinceUpdate,
        status,
      };
    });

    const stats = {
      fresh: freshness.filter(f => f.status === "fresh").length,
      aging: freshness.filter(f => f.status === "aging").length,
      stale: freshness.filter(f => f.status === "stale").length,
      outdated: freshness.filter(f => f.status === "outdated").length,
      total: freshness.length,
      avgAge: freshness.length > 0 ? Math.round(freshness.reduce((s, f) => s + f.daysSinceUpdate, 0) / freshness.length) : 0,
    };

    return NextResponse.json({ pages: freshness, stats });
  } catch (error) {
    console.error("Content freshness error:", error);
    return NextResponse.json({ error: "İçerik tazelik verileri yüklenemedi" }, { status: 500 });
  }
}
