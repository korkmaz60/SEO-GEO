import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";
import { getAuthenticatedClient } from "@/lib/google-auth";
import { google } from "googleapis";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ connected: false });

    const integration = await db.integration.findUnique({
      where: { projectId_provider: { projectId: ctx.projectId, provider: "GOOGLE_SEARCH_CONSOLE" } },
    });

    if (!integration?.refreshToken) {
      return NextResponse.json({ connected: false });
    }

    const client = getAuthenticatedClient(integration.accessToken, integration.refreshToken);
    const searchconsole = google.searchconsole({ version: "v1", auth: client });

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

    const [overviewRes, queriesRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl: `sc-domain:${ctx.project.domain}`,
        requestBody: { startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ["date"], rowLimit: 28 },
      }),
      searchconsole.searchanalytics.query({
        siteUrl: `sc-domain:${ctx.project.domain}`,
        requestBody: { startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ["query"], rowLimit: 50 },
      }),
    ]);

    const rows = overviewRes.data.rows || [];
    const totalClicks = rows.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
    const totalImpressions = rows.reduce((sum, r) => sum + (r.impressions ?? 0), 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgPosition = rows.length > 0 ? rows.reduce((sum, r) => sum + (r.position ?? 0), 0) / rows.length : 0;

    // Keyword'leri senkronize et
    for (const row of queriesRes.data.rows || []) {
      const keyword = row.keys?.[0];
      if (!keyword) continue;
      await db.keyword.upsert({
        where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
        update: { position: Math.round(row.position ?? 0), volume: Math.round(row.impressions ?? 0) },
        create: { projectId: ctx.projectId, keyword, position: Math.round(row.position ?? 0), volume: Math.round(row.impressions ?? 0), trend: "STABLE" },
      });
    }

    return NextResponse.json({
      connected: true,
      overview: { totalClicks, totalImpressions, avgCtr: Number(avgCtr.toFixed(2)), avgPosition: Number(avgPosition.toFixed(1)) },
      dailyTrend: rows.map((r) => ({ date: r.keys?.[0], clicks: r.clicks, impressions: r.impressions })),
      topQueries: (queriesRes.data.rows || []).slice(0, 20).map((r) => ({
        query: r.keys?.[0], clicks: r.clicks, impressions: r.impressions, position: Number((r.position ?? 0).toFixed(1)),
      })),
      synced: true,
    });
  } catch (error: unknown) {
    console.error("Search Console error:", error);
    return NextResponse.json({ connected: true, error: error instanceof Error ? error.message : "Hata" }, { status: 500 });
  }
}
