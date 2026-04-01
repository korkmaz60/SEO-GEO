import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";
import { getGoogleOAuthClient } from "@/lib/google-auth";
import { google } from "googleapis";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const integration = await db.integration.findUnique({
      where: { projectId_provider: { projectId: ctx.projectId, provider: "GOOGLE_ANALYTICS" } },
    });

    if (!integration?.refreshToken) {
      return NextResponse.json({ error: "Google Analytics bağlı değil", connected: false }, { status: 400 });
    }

    const client = getGoogleOAuthClient();
    client.setCredentials({
      refresh_token: integration.refreshToken,
      access_token: integration.accessToken,
    });

    const analyticsdata = google.analyticsdata({ version: "v1beta", auth: client });

    // GA4 Property ID — integration metadata'dan veya otomatik bul
    const propertyId = integration.propertyUrl;

    if (!propertyId) {
      // Property listesi çek
      const admin = google.analyticsadmin({ version: "v1beta", auth: client });
      const accountsRes = await admin.accountSummaries.list();
      const properties = accountsRes.data.accountSummaries?.flatMap(
        (a) => a.propertySummaries?.map((p) => ({
          id: p.property?.replace("properties/", ""),
          name: p.displayName,
        })) ?? []
      ) ?? [];

      return NextResponse.json({
        connected: true,
        needsProperty: true,
        properties,
      });
    }

    // Son 28 gün verileri
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    const [overviewRes, dailyRes, pagesRes] = await Promise.all([
      // Genel metrikler
      analyticsdata.properties.runReport({
        property: `properties/${propertyId}`,
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
      // Günlük trend
      analyticsdata.properties.runReport({
        property: `properties/${propertyId}`,
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
      // En çok ziyaret edilen sayfalar
      analyticsdata.properties.runReport({
        property: `properties/${propertyId}`,
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
      period: { start: formatDate(startDate), end: formatDate(endDate) },
      overview: {
        organicSessions: parseInt(metrics[0]?.value ?? "0"),
        organicUsers: parseInt(metrics[1]?.value ?? "0"),
        pageViews: parseInt(metrics[2]?.value ?? "0"),
        bounceRate: Number(parseFloat(metrics[3]?.value ?? "0").toFixed(2)),
        avgSessionDuration: Number(parseFloat(metrics[4]?.value ?? "0").toFixed(1)),
      },
      dailyTrend: (dailyRes.data.rows ?? []).map((r) => ({
        date: r.dimensionValues?.[0]?.value,
        sessions: parseInt(r.metricValues?.[0]?.value ?? "0"),
        users: parseInt(r.metricValues?.[1]?.value ?? "0"),
      })),
      topPages: (pagesRes.data.rows ?? []).map((r) => ({
        page: r.dimensionValues?.[0]?.value,
        views: parseInt(r.metricValues?.[0]?.value ?? "0"),
        sessions: parseInt(r.metricValues?.[1]?.value ?? "0"),
        bounceRate: Number(parseFloat(r.metricValues?.[2]?.value ?? "0").toFixed(2)),
      })),
    });
  } catch (error: unknown) {
    console.error("Analytics API error:", error);
    const message = error instanceof Error ? error.message : "Bilinmeyen hata";
    return NextResponse.json({ error: `Analytics verisi çekilemedi: ${message}` }, { status: 500 });
  }
}
