import { NextResponse } from "next/server";
import { google } from "googleapis";

import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";
import { getAuthenticatedClient } from "@/lib/google-auth";
import {
  listAnalyticsProperties,
  pickAnalyticsProperty,
  stringifyGoogleMetadata,
} from "@/lib/google-integrations";

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadi" }, { status: 400 });

    const integration = await db.integration.findUnique({
      where: { projectId_provider: { projectId: ctx.projectId, provider: "GOOGLE_ANALYTICS" } },
    });

    if (!integration?.refreshToken) {
      return NextResponse.json(
        { error: "Google Analytics bagli degil", connected: false },
        { status: 400 },
      );
    }

    const client = getAuthenticatedClient(integration.accessToken, integration.refreshToken);
    const properties = await listAnalyticsProperties(client);
    const selectedProperty =
      pickAnalyticsProperty(properties, integration.propertyUrl) ??
      null;

    if (!selectedProperty) {
      return NextResponse.json({
        connected: true,
        needsProperty: true,
        selectedPropertyId: null,
        properties,
      });
    }

    if (selectedProperty.id !== integration.propertyUrl || !integration.metadata) {
      await db.integration.update({
        where: { id: integration.id },
        data: {
          propertyUrl: selectedProperty.id,
          metadata: stringifyGoogleMetadata({
            selectedId: selectedProperty.id,
            selectedLabel: selectedProperty.label,
            availableCount: properties.length,
          }),
        },
      });
    }

    const analyticsdata = google.analyticsdata({ version: "v1beta", auth: client });
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);

    const [overviewRes, dailyRes, pagesRes] = await Promise.all([
      analyticsdata.properties.runReport({
        property: `properties/${selectedProperty.id}`,
        requestBody: {
          dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "screenPageViews" },
            { name: "bounceRate" },
            { name: "averageSessionDuration" },
          ],
          dimensionFilter: {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: { matchType: "EXACT", value: "Organic Search" },
            },
          },
        },
      }),
      analyticsdata.properties.runReport({
        property: `properties/${selectedProperty.id}`,
        requestBody: {
          dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
          dimensions: [{ name: "date" }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }],
          dimensionFilter: {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: { matchType: "EXACT", value: "Organic Search" },
            },
          },
          orderBys: [{ dimension: { dimensionName: "date" } }],
        },
      }),
      analyticsdata.properties.runReport({
        property: `properties/${selectedProperty.id}`,
        requestBody: {
          dateRanges: [{ startDate: formatDate(startDate), endDate: formatDate(endDate) }],
          dimensions: [{ name: "pagePath" }],
          metrics: [{ name: "screenPageViews" }, { name: "sessions" }, { name: "bounceRate" }],
          dimensionFilter: {
            filter: {
              fieldName: "sessionDefaultChannelGroup",
              stringFilter: { matchType: "EXACT", value: "Organic Search" },
            },
          },
          orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
          limit: "20",
        },
      }),
    ]);

    const overviewRow = overviewRes.data.rows?.[0];
    const metrics = overviewRow?.metricValues ?? [];

    return NextResponse.json({
      connected: true,
      selectedPropertyId: selectedProperty.id,
      selectionLabel: selectedProperty.label,
      properties,
      period: { start: formatDate(startDate), end: formatDate(endDate) },
      overview: {
        organicSessions: parseInt(metrics[0]?.value ?? "0", 10),
        organicUsers: parseInt(metrics[1]?.value ?? "0", 10),
        pageViews: parseInt(metrics[2]?.value ?? "0", 10),
        bounceRate: Number(parseFloat(metrics[3]?.value ?? "0").toFixed(2)),
        avgSessionDuration: Number(parseFloat(metrics[4]?.value ?? "0").toFixed(1)),
      },
      dailyTrend: (dailyRes.data.rows ?? []).map((row) => ({
        date: row.dimensionValues?.[0]?.value,
        sessions: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
        users: parseInt(row.metricValues?.[1]?.value ?? "0", 10),
      })),
      topPages: (pagesRes.data.rows ?? []).map((row) => ({
        page: row.dimensionValues?.[0]?.value,
        views: parseInt(row.metricValues?.[0]?.value ?? "0", 10),
        sessions: parseInt(row.metricValues?.[1]?.value ?? "0", 10),
        bounceRate: Number(parseFloat(row.metricValues?.[2]?.value ?? "0").toFixed(2)),
      })),
    });
  } catch (error: unknown) {
    console.error("Analytics API error:", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: `Analytics verisi cekilemedi: ${message}` }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadi" }, { status: 400 });

    const integration = await db.integration.findUnique({
      where: { projectId_provider: { projectId: ctx.projectId, provider: "GOOGLE_ANALYTICS" } },
    });

    if (!integration?.refreshToken) {
      return NextResponse.json({ error: "Google Analytics bagli degil" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { propertyId?: string };
    if (!body.propertyId) {
      return NextResponse.json({ error: "propertyId gerekli" }, { status: 400 });
    }

    const client = getAuthenticatedClient(integration.accessToken, integration.refreshToken);
    const properties = await listAnalyticsProperties(client);
    const selectedProperty = properties.find((property) => property.id === body.propertyId);

    if (!selectedProperty) {
      return NextResponse.json({ error: "Secilen property'ye erisim yok" }, { status: 400 });
    }

    await db.integration.update({
      where: { id: integration.id },
      data: {
        propertyUrl: selectedProperty.id,
        metadata: stringifyGoogleMetadata({
          selectedId: selectedProperty.id,
          selectedLabel: selectedProperty.label,
          availableCount: properties.length,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      selectedPropertyId: selectedProperty.id,
      selectionLabel: selectedProperty.label,
    });
  } catch (error: unknown) {
    console.error("Analytics selection error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Secim kaydedilemedi" },
      { status: 500 },
    );
  }
}
