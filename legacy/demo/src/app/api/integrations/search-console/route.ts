import { NextResponse } from "next/server";
import { google } from "googleapis";

import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";
import { getAuthenticatedClient } from "@/lib/google-auth";
import {
  listSearchConsoleSites,
  pickSearchConsoleSite,
  stringifyGoogleMetadata,
} from "@/lib/google-integrations";

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

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
    const sites = await listSearchConsoleSites(client);
    const selectedSite =
      pickSearchConsoleSite(sites, ctx.project.domain, integration.propertyUrl) ??
      null;

    if (!selectedSite) {
      return NextResponse.json({
        connected: true,
        needsSite: true,
        selectedSiteUrl: null,
        sites,
      });
    }

    if (selectedSite.siteUrl !== integration.propertyUrl || !integration.metadata) {
      await db.integration.update({
        where: { id: integration.id },
        data: {
          propertyUrl: selectedSite.siteUrl,
          metadata: stringifyGoogleMetadata({
            selectedId: selectedSite.siteUrl,
            selectedLabel: selectedSite.label,
            availableCount: sites.length,
          }),
        },
      });
    }

    const searchconsole = google.searchconsole({ version: "v1", auth: client });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);

    const [overviewRes, queriesRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl: selectedSite.siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ["date"],
          rowLimit: 28,
        },
      }),
      searchconsole.searchanalytics.query({
        siteUrl: selectedSite.siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ["query"],
          rowLimit: 50,
        },
      }),
    ]);

    const rows = overviewRes.data.rows ?? [];
    const totalClicks = rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
    const totalImpressions = rows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const avgPosition =
      rows.length > 0
        ? rows.reduce((sum, row) => sum + (row.position ?? 0), 0) / rows.length
        : 0;

    for (const row of queriesRes.data.rows ?? []) {
      const keyword = row.keys?.[0];
      if (!keyword) continue;

      await db.keyword.upsert({
        where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
        update: {
          position: Math.round(row.position ?? 0),
          impressions: Math.round(row.impressions ?? 0),
          clicks: Math.round(row.clicks ?? 0),
          ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : null,
          source: "GOOGLE_SEARCH_CONSOLE",
        },
        create: {
          projectId: ctx.projectId,
          keyword,
          position: Math.round(row.position ?? 0),
          impressions: Math.round(row.impressions ?? 0),
          clicks: Math.round(row.clicks ?? 0),
          ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : null,
          source: "GOOGLE_SEARCH_CONSOLE",
          trend: "STABLE",
        },
      });
    }

    return NextResponse.json({
      connected: true,
      selectedSiteUrl: selectedSite.siteUrl,
      selectionLabel: selectedSite.label,
      overview: {
        totalClicks,
        totalImpressions,
        avgCtr: Number(avgCtr.toFixed(2)),
        avgPosition: Number(avgPosition.toFixed(1)),
      },
      dailyTrend: rows.map((row) => ({
        date: row.keys?.[0],
        clicks: row.clicks,
        impressions: row.impressions,
      })),
      topQueries: (queriesRes.data.rows ?? []).slice(0, 20).map((row) => ({
        query: row.keys?.[0],
        clicks: row.clicks,
        impressions: row.impressions,
        position: Number((row.position ?? 0).toFixed(1)),
      })),
      sites,
      synced: true,
    });
  } catch (error: unknown) {
    console.error("Search Console error:", error);
    return NextResponse.json(
      {
        connected: true,
        error: error instanceof Error ? error.message : "Hata",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadi" }, { status: 400 });

    const integration = await db.integration.findUnique({
      where: { projectId_provider: { projectId: ctx.projectId, provider: "GOOGLE_SEARCH_CONSOLE" } },
    });

    if (!integration?.refreshToken) {
      return NextResponse.json({ error: "Google Search Console bagli degil" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { siteUrl?: string };
    if (!body.siteUrl) {
      return NextResponse.json({ error: "siteUrl gerekli" }, { status: 400 });
    }

    const client = getAuthenticatedClient(integration.accessToken, integration.refreshToken);
    const sites = await listSearchConsoleSites(client);
    const selectedSite = sites.find((site) => site.siteUrl === body.siteUrl);

    if (!selectedSite) {
      return NextResponse.json({ error: "Secilen siteye erisim yok" }, { status: 400 });
    }

    await db.integration.update({
      where: { id: integration.id },
      data: {
        propertyUrl: selectedSite.siteUrl,
        metadata: stringifyGoogleMetadata({
          selectedId: selectedSite.siteUrl,
          selectedLabel: selectedSite.label,
          availableCount: sites.length,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      selectedSiteUrl: selectedSite.siteUrl,
      selectionLabel: selectedSite.label,
    });
  } catch (error: unknown) {
    console.error("Search Console selection error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Secim kaydedilemedi" },
      { status: 500 },
    );
  }
}
