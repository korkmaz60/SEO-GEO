import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { checkSerpRanking } from "@/lib/dataforseo";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    if (!process.env.DATAFORSEO_LOGIN) {
      return NextResponse.json({ error: "DataForSEO yapılandırılmamış" }, { status: 400 });
    }

    const { keyword } = await req.json();
    if (!keyword) return NextResponse.json({ error: "Anahtar kelime gerekli" }, { status: 400 });

    const result = await checkSerpRanking(keyword, ctx.project.domain);

    // Keyword tablosundaki pozisyonu güncelle
    if (result.position) {
      await db.keyword.upsert({
        where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
        update: {
          prevPosition: undefined,
          position: result.position,
        },
        create: {
          projectId: ctx.projectId,
          keyword,
          position: result.position,
          trend: "STABLE",
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("SERP check error:", error);
    return NextResponse.json({ error: "SERP kontrolü başarısız" }, { status: 500 });
  }
}
