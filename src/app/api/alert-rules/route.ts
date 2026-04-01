import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ rules: [] });

    const rules = await db.alertRule.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      rules: rules.map(r => ({
        id: r.id,
        name: r.name,
        condition: JSON.parse(r.condition),
        channel: r.channel,
        webhookUrl: r.webhookUrl,
        enabled: r.enabled,
        lastTriggered: r.lastTriggered?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("AlertRules API error:", error);
    return NextResponse.json({ error: "Alert kuralları yüklenemedi" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { name, condition, channel, webhookUrl } = await req.json();
    if (!name || !condition) return NextResponse.json({ error: "Ad ve koşul zorunlu" }, { status: 400 });

    const rule = await db.alertRule.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        name,
        condition: JSON.stringify(condition),
        channel: channel || "app",
        webhookUrl: webhookUrl || null,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("AlertRule POST error:", error);
    return NextResponse.json({ error: "Alert kuralı oluşturulamadı" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    await db.alertRule.deleteMany({ where: { id, userId: ctx.userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("AlertRule DELETE error:", error);
    return NextResponse.json({ error: "Alert kuralı silinemedi" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id, enabled } = await req.json();
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    await db.alertRule.update({ where: { id }, data: { enabled } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("AlertRule PATCH error:", error);
    return NextResponse.json({ error: "Alert kuralı güncellenemedi" }, { status: 500 });
  }
}
