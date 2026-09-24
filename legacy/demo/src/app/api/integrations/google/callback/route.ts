import { NextResponse } from "next/server";
import { google } from "googleapis";

import { db } from "@/lib/db";
import { getAuthenticatedClient, getGoogleOAuthClient } from "@/lib/google-auth";
import {
  listAnalyticsProperties,
  listSearchConsoleSites,
  pickAnalyticsProperty,
  pickSearchConsoleSite,
  stringifyGoogleMetadata,
} from "@/lib/google-integrations";

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

async function syncInitialSearchConsoleData({
  authClient,
  projectId,
  projectDomain,
  siteUrl,
  userId,
}: {
  authClient: ReturnType<typeof getAuthenticatedClient>;
  projectId: string;
  projectDomain: string;
  siteUrl: string;
  userId: string;
}) {
  const searchconsole = google.searchconsole({ version: "v1", auth: authClient });
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 28);

  const [queriesRes, overviewRes, pagesRes] = await Promise.all([
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ["query"],
        rowLimit: 50,
      },
    }),
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ["date"],
        rowLimit: 28,
      },
    }),
    searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        dimensions: ["page"],
        rowLimit: 20,
      },
    }),
  ]);

  const queryRows = queriesRes.data.rows ?? [];
  for (const row of queryRows) {
    const keyword = row.keys?.[0];
    if (!keyword) continue;

    await db.keyword.upsert({
      where: { projectId_keyword: { projectId, keyword } },
      update: {
        position: Math.round(row.position ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        clicks: Math.round(row.clicks ?? 0),
        ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : null,
        source: "GOOGLE_SEARCH_CONSOLE",
      },
      create: {
        projectId,
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

  for (const row of pagesRes.data.rows ?? []) {
    const pageUrl = row.keys?.[0];
    if (!pageUrl) continue;

    try {
      const url = new URL(pageUrl);
      const host = url.hostname.replace(/^www\./, "");
      const projectHost = projectDomain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      if (host !== projectHost && !host.endsWith(`.${projectHost}`)) continue;

      const path = `${url.pathname}${url.search}` || "/";
      await db.page.upsert({
        where: { projectId_url: { projectId, url: path } },
        update: { status: "ACTIVE", indexed: true, source: "SEARCH_CONSOLE" },
        create: {
          projectId,
          url: path,
          title: path,
          status: "ACTIVE",
          indexed: true,
          source: "SEARCH_CONSOLE",
        },
      });
    } catch {
      continue;
    }
  }

  const overviewRows = overviewRes.data.rows ?? [];
  const totalClicks = overviewRows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
  const totalImpressions = overviewRows.reduce((sum, row) => sum + (row.impressions ?? 0), 0);

  await db.alert.create({
    data: {
      projectId,
      userId,
      type: "SUCCESS",
      message: `Google Search Console baglandi - ${queryRows.length} anahtar kelime, ${totalClicks} tiklama, ${totalImpressions} gosterim aktarıldı`,
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.redirect(new URL("/settings?error=missing_params", req.url));
    }

    const [userId, projectId] = state.split(":");
    if (!userId || !projectId) {
      return NextResponse.redirect(new URL("/settings?error=invalid_state", req.url));
    }

    const project = await db.project.findFirst({
      where: { id: projectId, userId },
    });

    if (!project) {
      return NextResponse.redirect(new URL("/settings?error=unauthorized", req.url));
    }

    const existingIntegrations = await db.integration.findMany({
      where: {
        projectId,
        provider: {
          in: ["GOOGLE_SEARCH_CONSOLE", "GOOGLE_ANALYTICS"],
        },
      },
    });

    const integrationMap = new Map(
      existingIntegrations.map((integration) => [integration.provider, integration]),
    );

    const oauthClient = getGoogleOAuthClient();
    const { tokens } = await oauthClient.getToken(code);
    const authClient = getAuthenticatedClient(tokens.access_token ?? null, tokens.refresh_token ?? null);

    const [sitesResult, propertiesResult] = await Promise.allSettled([
      listSearchConsoleSites(authClient),
      listAnalyticsProperties(authClient),
    ]);

    const sites = sitesResult.status === "fulfilled" ? sitesResult.value : [];
    const properties = propertiesResult.status === "fulfilled" ? propertiesResult.value : [];

    const selectedSite = pickSearchConsoleSite(
      sites,
      project.domain,
      integrationMap.get("GOOGLE_SEARCH_CONSOLE")?.propertyUrl,
    );
    const selectedProperty = pickAnalyticsProperty(
      properties,
      integrationMap.get("GOOGLE_ANALYTICS")?.propertyUrl,
    );

    await db.integration.upsert({
      where: { projectId_provider: { projectId, provider: "GOOGLE_SEARCH_CONSOLE" } },
      update: {
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? integrationMap.get("GOOGLE_SEARCH_CONSOLE")?.refreshToken ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        propertyUrl: selectedSite?.siteUrl ?? null,
        metadata: stringifyGoogleMetadata({
          selectedLabel: selectedSite?.label ?? null,
          selectedId: selectedSite?.siteUrl ?? null,
          availableCount: sites.length,
        }),
        connected: true,
      },
      create: {
        projectId,
        provider: "GOOGLE_SEARCH_CONSOLE",
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        propertyUrl: selectedSite?.siteUrl ?? null,
        metadata: stringifyGoogleMetadata({
          selectedLabel: selectedSite?.label ?? null,
          selectedId: selectedSite?.siteUrl ?? null,
          availableCount: sites.length,
        }),
        connected: true,
      },
    });

    await db.integration.upsert({
      where: { projectId_provider: { projectId, provider: "GOOGLE_ANALYTICS" } },
      update: {
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? integrationMap.get("GOOGLE_ANALYTICS")?.refreshToken ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        propertyUrl: selectedProperty?.id ?? null,
        metadata: stringifyGoogleMetadata({
          selectedLabel: selectedProperty?.label ?? null,
          selectedId: selectedProperty?.id ?? null,
          availableCount: properties.length,
        }),
        connected: true,
      },
      create: {
        projectId,
        provider: "GOOGLE_ANALYTICS",
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        propertyUrl: selectedProperty?.id ?? null,
        metadata: stringifyGoogleMetadata({
          selectedLabel: selectedProperty?.label ?? null,
          selectedId: selectedProperty?.id ?? null,
          availableCount: properties.length,
        }),
        connected: true,
      },
    });

    if (selectedSite) {
      try {
        await syncInitialSearchConsoleData({
          authClient,
          projectId,
          projectDomain: project.domain,
          siteUrl: selectedSite.siteUrl,
          userId,
        });
      } catch (error) {
        console.error("Initial Search Console sync error:", error);
        await db.alert.create({
          data: {
            projectId,
            userId,
            type: "WARNING",
            message: "Google Search Console baglandi ama ilk veri senkronu tamamlanamadi",
          },
        });
      }
    } else {
      await db.alert.create({
        data: {
          projectId,
          userId,
          type: "WARNING",
          message: "Google Search Console baglandi fakat uygun bir site secilemedi. Settings ekranindan secim yapin.",
        },
      });
    }

    if (!selectedProperty && properties.length > 1) {
      await db.alert.create({
        data: {
          projectId,
          userId,
          type: "INFO",
          message: "Google Analytics baglandi. Birden fazla property bulundu, Settings ekranindan dogru property'yi secin.",
        },
      });
    }

    return NextResponse.redirect(new URL("/settings?connected=google", req.url));
  } catch (error) {
    console.error("Google callback error:", error);
    return NextResponse.redirect(new URL("/settings?error=auth_failed", req.url));
  }
}
