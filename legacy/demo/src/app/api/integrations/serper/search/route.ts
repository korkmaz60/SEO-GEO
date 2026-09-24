import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { checkDomainPosition } from "@/lib/serper";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    if (!process.env.SERPAPI_KEY) {
      return NextResponse.json({ error: "Serper.dev yapılandırılmamış" }, { status: 400 });
    }

    const { keyword } = await req.json();
    if (!keyword) return NextResponse.json({ error: "Anahtar kelime gerekli" }, { status: 400 });

    const result = await checkDomainPosition(keyword, ctx.project.domain);

    // Pozisyonu DB'ye kaydet
    if (result.position) {
      const existing = await db.keyword.findUnique({
        where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
      });

      await db.keyword.upsert({
        where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
        update: {
          prevPosition: existing?.position,
          position: result.position,
          trend: existing?.position
            ? result.position < existing.position ? "UP"
              : result.position > existing.position ? "DOWN"
              : "STABLE"
            : "STABLE",
        },
        create: {
          projectId: ctx.projectId,
          keyword,
          position: result.position,
          trend: "STABLE",
        },
      });

      // Keyword history kaydet
      const kw = await db.keyword.findUnique({
        where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
      });
      if (kw) {
        await db.keywordHistory.create({
          data: {
            keywordId: kw.id,
            position: result.position,
          },
        });
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Serper search error:", error);
    return NextResponse.json({ error: "SERP kontrolü başarısız" }, { status: 500 });
  }
}
