import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "keywords";

    let csv = "";

    if (type === "keywords") {
      const keywords = await db.keyword.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { position: "asc" },
      });
      csv = "Keyword,Position,Prev Position,Volume,Clicks,Impressions,CTR,Difficulty,Trend,Source\n";
      csv += keywords.map(kw =>
        `"${kw.keyword}",${kw.position ?? ""},${kw.prevPosition ?? ""},${kw.volume ?? ""},${kw.clicks ?? ""},${kw.impressions ?? ""},${kw.ctr ?? ""},${kw.difficulty ?? ""},${kw.trend},${kw.source}`
      ).join("\n");
    } else if (type === "pages") {
      const pages = await db.page.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { url: "asc" },
      });
      csv = "URL,Title,Word Count,Source,Indexed,Status,Last Crawl\n";
      csv += pages.map(p =>
        `"${p.url}","${p.title ?? ""}",${p.wordCount ?? ""},${p.source},${p.indexed},${p.status},${p.lastCrawl?.toISOString() ?? ""}`
      ).join("\n");
    } else if (type === "issues") {
      const issues = await db.technicalIssue.findMany({
        where: { crawl: { projectId: ctx.projectId } },
        orderBy: { severity: "asc" },
        include: { page: { select: { url: true } } },
      });
      csv = "Category,Severity,Message,Page URL\n";
      csv += issues.map(i =>
        `"${i.category}",${i.severity},"${i.message}","${i.page?.url ?? ""}"`
      ).join("\n");
    } else if (type === "competitors") {
      const competitors = await db.competitor.findMany({
        where: { projectId: ctx.projectId },
      });
      csv = "Name,Domain,SEO Score,GEO Score,Traffic,Citations\n";
      csv += competitors.map(c =>
        `"${c.name}","${c.domain}",${c.seoScore ?? 0},${c.geoScore ?? 0},${c.traffic ?? 0},${c.citations ?? 0}`
      ).join("\n");
    }

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-${ctx.project.domain}-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Export başarısız" }, { status: 500 });
  }
}
