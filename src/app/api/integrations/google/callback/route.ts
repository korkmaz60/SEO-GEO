import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getGoogleOAuthClient, getAuthenticatedClient } from "@/lib/google-auth";
import { google } from "googleapis";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    if (!code || !state) {
      return NextResponse.redirect(new URL("/settings?error=missing_params", req.url));
    }

    // State = userId:projectId (multi-user güvenlik)
    const [userId, projectId] = state.split(":");
    if (!userId || !projectId) {
      return NextResponse.redirect(new URL("/settings?error=invalid_state", req.url));
    }

    // Proje bu kullanıcıya ait mi?
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
    });
    if (!project) {
      return NextResponse.redirect(new URL("/settings?error=unauthorized", req.url));
    }

    // Token al
    const oauthClient = getGoogleOAuthClient();
    const { tokens } = await oauthClient.getToken(code);

    // Entegrasyonları kaydet
    for (const provider of ["GOOGLE_SEARCH_CONSOLE", "GOOGLE_ANALYTICS"] as const) {
      await db.integration.upsert({
        where: { projectId_provider: { projectId, provider } },
        update: {
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          connected: true,
        },
        create: {
          projectId,
          provider,
          accessToken: tokens.access_token ?? null,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          connected: true,
        },
      });
    }

    // ========== OTOMATİK VERİ ÇEKME ==========
    const authClient = getAuthenticatedClient(tokens.access_token ?? null, tokens.refresh_token ?? null);

    // 1. Search Console verileri
    try {
      const searchconsole = google.searchconsole({ version: "v1", auth: authClient });
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 28);
      const fmt = (d: Date) => d.toISOString().split("T")[0];

      // Top sorgular -> keyword olarak kaydet
      const queriesRes = await searchconsole.searchanalytics.query({
        siteUrl: `sc-domain:${project.domain}`,
        requestBody: {
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query"],
          rowLimit: 50,
        },
      });

      const rows = queriesRes.data.rows || [];
      for (const row of rows) {
        const keyword = row.keys?.[0];
        if (!keyword) continue;

        await db.keyword.upsert({
          where: { projectId_keyword: { projectId, keyword } },
          update: {
            position: Math.round(row.position ?? 0),
            volume: Math.round(row.impressions ?? 0),
            trend: "STABLE",
          },
          create: {
            projectId,
            keyword,
            position: Math.round(row.position ?? 0),
            volume: Math.round(row.impressions ?? 0),
            trend: "STABLE",
          },
        });
      }

      // Genel performans (günlük)
      const overviewRes = await searchconsole.searchanalytics.query({
        siteUrl: `sc-domain:${project.domain}`,
        requestBody: {
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["date"],
          rowLimit: 28,
        },
      });

      const dailyRows = overviewRes.data.rows || [];
      const totalClicks = dailyRows.reduce((sum, r) => sum + (r.clicks ?? 0), 0);
      const totalImpressions = dailyRows.reduce((sum, r) => sum + (r.impressions ?? 0), 0);

      // Bildirim oluştur
      await db.alert.create({
        data: {
          projectId,
          userId,
          type: "SUCCESS",
          message: `Google Search Console bağlandı — ${rows.length} anahtar kelime, ${totalClicks} tıklama, ${totalImpressions} gösterim aktarıldı`,
        },
      });

      // Top sayfalar -> page olarak kaydet
      const pagesRes = await searchconsole.searchanalytics.query({
        siteUrl: `sc-domain:${project.domain}`,
        requestBody: {
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["page"],
          rowLimit: 20,
        },
      });

      for (const row of pagesRes.data.rows || []) {
        const pageUrl = row.keys?.[0];
        if (!pageUrl) continue;
        try {
          const path = new URL(pageUrl).pathname;
          await db.page.upsert({
            where: { projectId_url: { projectId, url: path } },
            update: { status: "ACTIVE", indexed: true, source: "SEARCH_CONSOLE" },
            create: { projectId, url: path, title: path, status: "ACTIVE", indexed: true, source: "SEARCH_CONSOLE" },
          });
        } catch { /* invalid URL */ }
      }
    } catch (e) {
      console.error("Search Console auto-fetch error:", e);
      await db.alert.create({
        data: {
          projectId, userId, type: "WARNING",
          message: "Google Search Console bağlandı ama veri çekilemedi — domain doğrulandığından emin olun",
        },
      });
    }

    return NextResponse.redirect(new URL("/settings?connected=google", req.url));
  } catch (error) {
    console.error("Google callback error:", error);
    return NextResponse.redirect(new URL("/settings?error=auth_failed", req.url));
  }
}
