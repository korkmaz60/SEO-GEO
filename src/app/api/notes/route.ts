import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ notes: [] });

    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get("targetType");
    const targetId = searchParams.get("targetId");

    const where: Record<string, unknown> = { projectId: ctx.projectId };
    if (targetType) where.targetType = targetType;
    if (targetId) where.targetId = targetId;

    const notes = await db.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });

    return NextResponse.json({
      notes: notes.map(n => ({
        id: n.id,
        content: n.content,
        targetType: n.targetType,
        targetId: n.targetId,
        userName: n.user.name,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Notes API error:", error);
    return NextResponse.json({ error: "Notlar yüklenemedi" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { content, targetType, targetId } = await req.json();
    if (!content) return NextResponse.json({ error: "İçerik zorunlu" }, { status: 400 });

    const note = await db.note.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        content,
        targetType: targetType || "project",
        targetId: targetId || null,
      },
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (error) {
    console.error("Note POST error:", error);
    return NextResponse.json({ error: "Not eklenemedi" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    await db.note.deleteMany({ where: { id, userId: ctx.userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Note DELETE error:", error);
    return NextResponse.json({ error: "Not silinemedi" }, { status: 500 });
  }
}
