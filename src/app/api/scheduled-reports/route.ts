import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ schedules: [] });

    const schedules = await db.scheduledReport.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      schedules: schedules.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        schedule: s.schedule,
        scheduleLabel: parseCronLabel(s.schedule),
        recipients: JSON.parse(s.recipients),
        enabled: s.enabled,
        lastRun: s.lastRun?.toISOString() || null,
        nextRun: s.nextRun?.toISOString() || null,
      })),
    });
  } catch (error) {
    console.error("ScheduledReports API error:", error);
    return NextResponse.json({ error: "Zamanlanmış raporlar yüklenemedi" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { name, type, schedule, recipients } = await req.json();
    if (!name || !type || !schedule) return NextResponse.json({ error: "Ad, tür ve zamanlama zorunlu" }, { status: 400 });

    const nextRun = calculateNextRun(schedule);

    const report = await db.scheduledReport.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        name,
        type: type as "FULL" | "GEO" | "SEO" | "TECHNICAL" | "COMPETITOR" | "WEEKLY_SUMMARY",
        schedule,
        recipients: JSON.stringify(recipients || []),
        nextRun,
      },
    });

    return NextResponse.json({ schedule: report }, { status: 201 });
  } catch (error) {
    console.error("ScheduledReport POST error:", error);
    return NextResponse.json({ error: "Zamanlanmış rapor oluşturulamadı" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    await db.scheduledReport.deleteMany({ where: { id, userId: ctx.userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ScheduledReport DELETE error:", error);
    return NextResponse.json({ error: "Zamanlanmış rapor silinemedi" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

    const { id, enabled } = await req.json();
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (typeof enabled === "boolean") data.enabled = enabled;

    await db.scheduledReport.update({ where: { id }, data });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ScheduledReport PATCH error:", error);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 500 });
  }
}

function parseCronLabel(cron: string): string {
  // Basit cron açıklama
  const parts = cron.split(" ");
  if (parts.length !== 5) return cron;
  const [min, hour, dayOfMonth, , dayOfWeek] = parts;

  if (dayOfWeek === "1" && dayOfMonth === "*") return `Her Pazartesi ${hour}:${min.padStart(2, "0")}`;
  if (dayOfWeek === "5" && dayOfMonth === "*") return `Her Cuma ${hour}:${min.padStart(2, "0")}`;
  if (dayOfMonth === "1" && dayOfWeek === "*") return `Her ayın 1'i ${hour}:${min.padStart(2, "0")}`;
  if (dayOfWeek === "*" && dayOfMonth === "*") return `Her gün ${hour}:${min.padStart(2, "0")}`;
  return cron;
}

function calculateNextRun(cron: string): Date {
  // Basit next run hesaplama
  const now = new Date();
  const parts = cron.split(" ");
  if (parts.length !== 5) return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [min, hour] = parts;
  const next = new Date(now);
  next.setHours(parseInt(hour), parseInt(min), 0, 0);
  if (next <= now) next.setDate(next.getDate() + 7);
  return next;
}
