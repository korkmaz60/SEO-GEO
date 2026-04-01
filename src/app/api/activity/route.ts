import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ activities: [] });

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");

    const activities = await db.activityLog.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { name: true, email: true } } },
    });

    return NextResponse.json({
      activities: activities.map(a => ({
        id: a.id,
        action: a.action,
        details: a.details,
        userName: a.user.name || a.user.email,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Activity API error:", error);
    return NextResponse.json({ error: "Aktiviteler yüklenemedi" }, { status: 500 });
  }
}
