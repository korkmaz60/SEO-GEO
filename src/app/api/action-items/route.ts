import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

// GET — Tüm yapılacakları getir
export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ items: [], stats: {} });

    const items = await db.actionItem.findMany({
      where: { projectId: ctx.projectId },
      orderBy: [{ completed: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    });

    const stats = {
      total: items.length,
      completed: items.filter((i) => i.completed).length,
      pending: items.filter((i) => !i.completed).length,
      critical: items.filter((i) => !i.completed && i.priority === "CRITICAL").length,
      high: items.filter((i) => !i.completed && i.priority === "HIGH").length,
    };

    return NextResponse.json({ items, stats });
  } catch (error) {
    console.error("ActionItems GET error:", error);
    return NextResponse.json({ error: "Veriler yüklenemedi" }, { status: 500 });
  }
}

// PATCH — Tamamlandı olarak işaretle / geri al
export async function PATCH(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id, completed } = await req.json();
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    const item = await db.actionItem.update({
      where: { id },
      data: {
        completed,
        completedAt: completed ? new Date() : null,
      },
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error("ActionItems PATCH error:", error);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 500 });
  }
}

// DELETE — Tüm yapılacakları sil (yeniden üretmek için)
export async function DELETE() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    await db.actionItem.deleteMany({ where: { projectId: ctx.projectId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ActionItems DELETE error:", error);
    return NextResponse.json({ error: "Silme başarısız" }, { status: 500 });
  }
}
