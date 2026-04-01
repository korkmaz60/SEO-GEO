import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ keywords: [], organic: [], total: 0 });
    const { projectId } = ctx;

    const { searchParams } = new URL(req.url);
    const filter = searchParams.get("filter"); // "tracked" | "organic" | null (all)

    const where = filter === "tracked"
      ? { projectId, tracked: true }
      : filter === "organic"
        ? { projectId, tracked: false }
        : { projectId };

    const keywords = await db.keyword.findMany({
      where,
      orderBy: [{ position: { sort: "asc", nulls: "last" } }, { keyword: "asc" }],
      include: {
        history: {
          orderBy: { recordedAt: "desc" },
          take: 12,
        },
      },
    });

    return NextResponse.json({
      keywords: keywords.map((kw) => ({
        id: kw.id,
        keyword: kw.keyword,
        position: kw.position,
        prevPosition: kw.prevPosition,
        volume: kw.volume,
        clicks: kw.clicks,
        impressions: kw.impressions,
        ctr: kw.ctr,
        difficulty: kw.difficulty,
        geoScore: kw.geoScore,
        tracked: kw.tracked,
        source: kw.source.toLowerCase(),
        positionType: kw.source === "GOOGLE_SEARCH_CONSOLE" ? "average" : "realtime",
        trend: kw.trend.toLowerCase(),
        history: kw.history.map((h) => ({
          position: h.position,
          volume: h.volume,
          date: h.recordedAt.toISOString(),
        })),
      })),
      total: keywords.length,
    });
  } catch (error) {
    console.error("Keywords API error:", error);
    return NextResponse.json({ error: "Veriler yüklenirken hata oluştu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { keyword, position, volume, difficulty } = await req.json();
    if (!keyword) return NextResponse.json({ error: "Anahtar kelime zorunlu" }, { status: 400 });

    const existing = await db.keyword.findFirst({
      where: { projectId: ctx.projectId, keyword },
    });
    if (existing) return NextResponse.json({ error: "Bu kelime zaten mevcut" }, { status: 409 });

    // Manuel eklenen keyword → otomatik tracked
    const kw = await db.keyword.create({
      data: {
        projectId: ctx.projectId,
        keyword,
        position: position || null,
        volume: volume || null,
        difficulty: difficulty || null,
        tracked: true,
        trend: "STABLE",
      },
    });

    return NextResponse.json({ keyword: kw }, { status: 201 });
  } catch (error) {
    console.error("Keywords POST error:", error);
    return NextResponse.json({ error: "Kelime eklenemedi" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { id, tracked } = await req.json();
    if (!id || typeof tracked !== "boolean") {
      return NextResponse.json({ error: "id ve tracked gerekli" }, { status: 400 });
    }

    await db.keyword.updateMany({
      where: { id, projectId: ctx.projectId },
      data: { tracked },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Keywords PATCH error:", error);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    await db.keyword.deleteMany({ where: { id, projectId: ctx.projectId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Keywords DELETE error:", error);
    return NextResponse.json({ error: "Kelime silinemedi" }, { status: 500 });
  }
}
