import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ reports: [] });
    const { userId } = ctx;

    const reports = await db.report.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { name: true } } },
    });

    return NextResponse.json({
      reports: reports.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        format: r.format,
        fileSize: r.fileSize,
        status: r.status.toLowerCase(),
        projectName: r.project.name,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Reports API error:", error);
    return NextResponse.json({ error: "Veriler yüklenirken hata oluştu" }, { status: 500 });
  }
}
