import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ current: null, history: [], anchors: [] });

    // Son snapshot'ları çek
    const history = await db.backlinkSnapshot.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { measuredAt: "desc" },
      take: 12,
    });

    const current = history[0] || null;
    const prev = history[1] || null;

    return NextResponse.json({
      current: current ? {
        totalBacklinks: current.totalBacklinks,
        referringDomains: current.referringDomains,
        domainRank: current.domainRank,
        brokenBacklinks: current.brokenBacklinks,
        newBacklinks: current.newBacklinks,
        lostBacklinks: current.lostBacklinks,
        measuredAt: current.measuredAt.toISOString(),
        changes: prev ? {
          backlinksChange: current.totalBacklinks - prev.totalBacklinks,
          domainsChange: current.referringDomains - prev.referringDomains,
          rankChange: current.domainRank - prev.domainRank,
        } : null,
      } : null,
      history: history.reverse().map(h => ({
        totalBacklinks: h.totalBacklinks,
        referringDomains: h.referringDomains,
        domainRank: h.domainRank,
        measuredAt: h.measuredAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Backlinks API error:", error);
    return NextResponse.json({ error: "Backlink verileri yüklenemedi" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
      return NextResponse.json({ error: "DataForSEO yapılandırılmamış" }, { status: 400 });
    }

    const { getBacklinkSummary } = await import("@/lib/dataforseo");
    const bl = await getBacklinkSummary(ctx.project.domain);

    // Önceki snapshot ile karşılaştır
    const prevSnapshot = await db.backlinkSnapshot.findFirst({
      where: { projectId: ctx.projectId },
      orderBy: { measuredAt: "desc" },
    });

    const newBacklinks = prevSnapshot ? Math.max(0, bl.totalBacklinks - prevSnapshot.totalBacklinks) : 0;
    const lostBacklinks = prevSnapshot ? Math.max(0, prevSnapshot.totalBacklinks - bl.totalBacklinks) : 0;

    const snapshot = await db.backlinkSnapshot.create({
      data: {
        projectId: ctx.projectId,
        totalBacklinks: bl.totalBacklinks,
        referringDomains: bl.referringDomains,
        domainRank: bl.domainRank ?? 0,
        brokenBacklinks: bl.brokenBacklinks,
        newBacklinks,
        lostBacklinks,
      },
    });

    await db.activityLog.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        action: "backlinks_updated",
        details: `Backlink güncellendi: ${bl.totalBacklinks} backlink, ${bl.referringDomains} referring domain`,
      },
    });

    return NextResponse.json({
      snapshot: {
        totalBacklinks: snapshot.totalBacklinks,
        referringDomains: snapshot.referringDomains,
        domainRank: snapshot.domainRank,
        newBacklinks: snapshot.newBacklinks,
        lostBacklinks: snapshot.lostBacklinks,
      },
    });
  } catch (error) {
    console.error("Backlinks POST error:", error);
    return NextResponse.json({ error: "Backlink güncellemesi başarısız" }, { status: 500 });
  }
}
