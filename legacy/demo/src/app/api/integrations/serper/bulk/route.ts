import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { bulkCheckPositions } from "@/lib/serper";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    if (!process.env.SERPAPI_KEY) {
      return NextResponse.json({ error: "Serper.dev yapılandırılmamış" }, { status: 400 });
    }

    // Projedeki tüm keyword'leri al
    const keywords = await db.keyword.findMany({
      where: { projectId: ctx.projectId },
      select: { keyword: true },
    });

    if (keywords.length === 0) {
      return NextResponse.json({ error: "Takip edilen anahtar kelime yok" }, { status: 400 });
    }

    const keywordList = keywords.map((k) => k.keyword);
    const results = await bulkCheckPositions(keywordList, ctx.project.domain);

    // Sonuçları DB'ye kaydet
    let updated = 0;
    for (const result of results) {
      if (result.position && !("error" in result)) {
        const existing = await db.keyword.findUnique({
          where: { projectId_keyword: { projectId: ctx.projectId, keyword: result.keyword } },
        });

        if (existing) {
          await db.keyword.update({
            where: { id: existing.id },
            data: {
              prevPosition: existing.position,
              position: result.position,
              trend: result.position < (existing.position ?? 999) ? "UP"
                : result.position > (existing.position ?? 0) ? "DOWN"
                : "STABLE",
            },
          });

          await db.keywordHistory.create({
            data: { keywordId: existing.id, position: result.position },
          });

          updated++;
        }
      }
    }

    return NextResponse.json({
      total: results.length,
      updated,
      results: results.map((r) => ({
        keyword: r.keyword,
        position: r.position,
        url: "url" in r ? r.url : null,
      })),
    });
  } catch (error) {
    console.error("Bulk SERP error:", error);
    return NextResponse.json({ error: "Toplu SERP kontrolü başarısız" }, { status: 500 });
  }
}
