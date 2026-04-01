import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ alerts: [], unreadCount: 0 });

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const [alerts, total, unreadCount] = await Promise.all([
      db.alert.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      db.alert.count({ where: { projectId: ctx.projectId } }),
      db.alert.count({ where: { projectId: ctx.projectId, read: false } }),
    ]);

    return NextResponse.json({
      alerts: alerts.map(a => ({
        id: a.id,
        type: a.type.toLowerCase(),
        message: a.message,
        read: a.read,
        createdAt: a.createdAt.toISOString(),
      })),
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Alerts API error:", error);
    return NextResponse.json({ error: "Bildirimler yüklenemedi" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { id, markAllRead } = await req.json();

    if (markAllRead) {
      await db.alert.updateMany({
        where: { projectId: ctx.projectId, read: false },
        data: { read: true },
      });
    } else if (id) {
      await db.alert.update({ where: { id }, data: { read: true } });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Alert PATCH error:", error);
    return NextResponse.json({ error: "Bildirim güncellenemedi" }, { status: 500 });
  }
}
