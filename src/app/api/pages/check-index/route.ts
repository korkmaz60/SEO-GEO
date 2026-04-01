import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { db } from "@/lib/db";
import { checkIndexedPages } from "@/lib/serper";

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    if (!process.env.SERPAPI_KEY) {
      return NextResponse.json({ error: "SerpApi key gerekli" }, { status: 400 });
    }

    const domain = ctx.project.domain;
    const result = await checkIndexedPages(domain);

    // Tüm sayfaları indexed=false yap
    await db.page.updateMany({
      where: { projectId: ctx.projectId },
      data: { indexed: false },
    });

    // Google'da bulunan sayfaları indexed=true yap
    let indexedCount = 0;
    for (const page of result.pages) {
      if (!page.url) continue;
      try {
        const path = new URL(page.url).pathname;
        const updated = await db.page.updateMany({
          where: { projectId: ctx.projectId, url: path },
          data: { indexed: true },
        });
        if (updated.count === 0) {
          await db.page.create({
            data: { projectId: ctx.projectId, url: path, title: page.title || path, status: "ACTIVE", source: "SEARCH_CONSOLE", indexed: true },
          });
        }
        indexedCount++;
      } catch { /* */ }
    }

    const totalPages = await db.page.count({ where: { projectId: ctx.projectId } });

    await db.alert.create({
      data: {
        projectId: ctx.projectId, userId: ctx.userId, type: "SUCCESS",
        message: `Index kontrolü: ${indexedCount} sayfa Google'da indexli (toplam ${totalPages}, Google'da ${result.totalResults} sonuç)`,
      },
    });

    return NextResponse.json({ indexed: indexedCount, total: totalPages, googleTotal: result.totalResults });
  } catch (error) {
    console.error("Index check error:", error);
    return NextResponse.json({ error: "Index kontrolü başarısız" }, { status: 500 });
  }
}
