import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { getKeywordData } from "@/lib/dataforseo";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    if (!process.env.DATAFORSEO_LOGIN) {
      return NextResponse.json({ error: "DataForSEO yapılandırılmamış" }, { status: 400 });
    }

    const { keywords } = await req.json();
    if (!keywords?.length) return NextResponse.json({ error: "Anahtar kelimeler gerekli" }, { status: 400 });

    const results = await getKeywordData(keywords);

    // Veritabanını güncelle
    for (const kw of results) {
      if (kw.keyword && kw.volume > 0) {
        await db.keyword.upsert({
          where: { projectId_keyword: { projectId: ctx.projectId, keyword: kw.keyword } },
          update: { volume: kw.volume },
          create: {
            projectId: ctx.projectId,
            keyword: kw.keyword,
            volume: kw.volume,
            trend: "STABLE",
          },
        });
      }
    }

    return NextResponse.json({ results, updated: results.length });
  } catch (error) {
    console.error("Keyword data error:", error);
    return NextResponse.json({ error: "Keyword verileri alınamadı" }, { status: 500 });
  }
}
