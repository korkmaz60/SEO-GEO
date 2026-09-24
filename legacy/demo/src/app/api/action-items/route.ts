import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

const priorityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) {
      return NextResponse.json({
        noProject: true,
        items: [],
        stats: {
          total: 0,
          completed: 0,
          pending: 0,
          critical: 0,
          high: 0,
          completionRate: 0,
          topCategories: [],
          byCategory: [],
          byPriority: [],
          generatedAt: null,
        },
      });
    }

    const items = await db.actionItem.findMany({
      where: { projectId: ctx.projectId },
      orderBy: [{ completed: "asc" }, { priority: "asc" }, { createdAt: "desc" }],
    });

    const completed = items.filter((item) => item.completed).length;
    const pending = items.length - completed;
    const completionRate = items.length > 0 ? Math.round((completed / items.length) * 100) : 0;

    const byCategoryMap = new Map<
      string,
      { category: string; total: number; pending: number; completed: number }
    >();
    const byPriorityMap = new Map<
      string,
      { priority: string; total: number; pending: number }
    >();

    for (const item of items) {
      const categoryEntry = byCategoryMap.get(item.category) ?? {
        category: item.category,
        total: 0,
        pending: 0,
        completed: 0,
      };
      categoryEntry.total += 1;
      if (item.completed) categoryEntry.completed += 1;
      else categoryEntry.pending += 1;
      byCategoryMap.set(item.category, categoryEntry);

      const priorityEntry = byPriorityMap.get(item.priority) ?? {
        priority: item.priority,
        total: 0,
        pending: 0,
      };
      priorityEntry.total += 1;
      if (!item.completed) priorityEntry.pending += 1;
      byPriorityMap.set(item.priority, priorityEntry);
    }

    const byCategory = [...byCategoryMap.values()].sort((left, right) => {
      const pendingDiff = right.pending - left.pending;
      if (pendingDiff !== 0) return pendingDiff;
      return right.total - left.total;
    });

    const byPriority = priorityOrder.map((priority) => {
      const existing = byPriorityMap.get(priority);
      return existing ?? { priority, total: 0, pending: 0 };
    });

    const stats = {
      total: items.length,
      completed,
      pending,
      critical: items.filter((item) => !item.completed && item.priority === "CRITICAL").length,
      high: items.filter((item) => !item.completed && item.priority === "HIGH").length,
      completionRate,
      topCategories: byCategory.filter((entry) => entry.pending > 0).slice(0, 3),
      byCategory,
      byPriority,
      generatedAt: items[0]?.createdAt?.toISOString() ?? null,
    };

    return NextResponse.json({ items, stats });
  } catch (error) {
    console.error("ActionItems GET error:", error);
    return NextResponse.json({ error: "Veriler yuklenemedi" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadi" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { id?: string; completed?: boolean };
    if (!body.id || typeof body.completed !== "boolean") {
      return NextResponse.json({ error: "Gecerli id ve completed gerekli" }, { status: 400 });
    }

    const existing = await db.actionItem.findFirst({
      where: { id: body.id, projectId: ctx.projectId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Aksiyon bulunamadi" }, { status: 404 });
    }

    const item = await db.actionItem.update({
      where: { id: existing.id },
      data: {
        completed: body.completed,
        completedAt: body.completed ? new Date() : null,
      },
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error("ActionItems PATCH error:", error);
    return NextResponse.json({ error: "Guncelleme basarisiz" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadi" }, { status: 400 });

    await db.actionItem.deleteMany({ where: { projectId: ctx.projectId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("ActionItems DELETE error:", error);
    return NextResponse.json({ error: "Silme basarisiz" }, { status: 500 });
  }
}
