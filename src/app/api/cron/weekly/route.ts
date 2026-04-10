import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail, buildWeeklyReportEmail } from "@/lib/email";

/**
 * Haftalık kapsamlı güncelleme cron job'ı.
 * Her proje için: crawl, keyword sync, AI visibility, backlink, e-posta raporu.
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const projects = await db.project.findMany({
      include: { user: { select: { email: true, name: true } } },
    });

    const results = [];

    for (const project of projects) {
      const projectResult: Record<string, unknown> = { project: project.domain };
      try {
        // ========== 1. ANA SAYFA CRAWL ==========
        let crawlIssues = 0;
        try {
          const crawlSession = await db.crawlSession.create({
            data: { projectId: project.id, status: "RUNNING" },
          });

          const startTime = Date.now();
          const res = await fetch(`https://${project.domain}`, {
            headers: { "User-Agent": "SEO-GEO-Cron/1.0" },
            signal: AbortSignal.timeout(15000),
          });
          const responseTime = Date.now() - startTime;

          if (res.ok) {
            const html = await res.text();
            const issues: { category: string; severity: "CRITICAL" | "WARNING" | "NOTICE"; message: string }[] = [];
            const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
            const desc = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)?.[1]?.trim() || "";
            const h1s = html.match(/<h1[^>]*>/gi) || [];
            const hasSchema = html.includes("application/ld+json");
            const hasCanonical = /<link\s+rel=["']canonical["']/i.test(html);
            const imgs = html.match(/<img[^>]*>/gi) || [];
            const noAltImgs = imgs.filter(img => !img.includes("alt=") || /alt=["']\s*["']/.test(img));
            const cleanText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

            if (!title) issues.push({ category: "Meta Başlık", severity: "CRITICAL", message: "Title yok" });
            else if (title.length > 60) issues.push({ category: "Meta Başlık", severity: "WARNING", message: `Title çok uzun (${title.length})` });
            if (!desc) issues.push({ category: "Meta Açıklama", severity: "WARNING", message: "Description yok" });
            if (h1s.length === 0) issues.push({ category: "H1", severity: "WARNING", message: "H1 yok" });
            if (!hasSchema) issues.push({ category: "Schema", severity: "NOTICE", message: "Yapısal veri yok" });
            if (!hasCanonical) issues.push({ category: "Canonical", severity: "WARNING", message: "Canonical yok" });
            if (noAltImgs.length > 0) issues.push({ category: "Alt Metin", severity: "WARNING", message: `${noAltImgs.length} görselde alt metin eksik` });
            if (wordCount < 300) issues.push({ category: "İçerik", severity: "WARNING", message: `Az içerik (${wordCount} kelime)` });
            if (responseTime > 3000) issues.push({ category: "Hız", severity: "WARNING", message: `Yavaş yanıt (${(responseTime / 1000).toFixed(1)}s)` });

            for (const issue of issues) {
              await db.technicalIssue.create({ data: { crawlId: crawlSession.id, ...issue } });
            }
            crawlIssues = issues.length;

            // Sayfa bilgisini güncelle
            await db.page.upsert({
              where: { projectId_url: { projectId: project.id, url: "/" } },
              update: { title, lastCrawl: new Date(), wordCount },
              create: { projectId: project.id, url: "/", title, wordCount, status: "ACTIVE" },
            });

            await db.crawlSession.update({
              where: { id: crawlSession.id },
              data: { pagesScanned: 1, issuesFound: issues.length, status: "COMPLETED", finishedAt: new Date() },
            });

            // Health score güncelle
            const healthScore = Math.max(0, 100 - crawlIssues * 5);

            // SEO skor — mevcut skorlara health ekle
            const prevSeo = await db.seoScore.findFirst({ where: { projectId: project.id }, orderBy: { measuredAt: "desc" } });
            if (prevSeo) {
              await db.seoScore.create({
                data: {
                  projectId: project.id,
                  overallScore: prevSeo.overallScore,
                  healthScore,
                  speedMobile: prevSeo.speedMobile,
                  speedDesktop: prevSeo.speedDesktop,
                  lcpValue: prevSeo.lcpValue,
                  fidValue: prevSeo.fidValue,
                  clsValue: prevSeo.clsValue,
                },
              });
            }
          }

          projectResult.crawl = { issues: crawlIssues };
        } catch {
          projectResult.crawl = { error: "Crawl başarısız" };
        }

        // ========== 2. KEYWORD SYNC ==========
        let keywordsSynced = 0;
        try {
          // GSC sync
          const gscIntegration = await db.integration.findUnique({
            where: { projectId_provider: { projectId: project.id, provider: "GOOGLE_SEARCH_CONSOLE" } },
          });

          if (gscIntegration?.refreshToken) {
            const { getAuthenticatedClient } = await import("@/lib/google-auth");
            const {
              listSearchConsoleSites,
              pickSearchConsoleSite,
              stringifyGoogleMetadata,
            } = await import("@/lib/google-integrations");
            const { google } = await import("googleapis");
            const client = getAuthenticatedClient(gscIntegration.accessToken, gscIntegration.refreshToken);
            const sites = await listSearchConsoleSites(client);
            const selectedSite =
              pickSearchConsoleSite(sites, project.domain, gscIntegration.propertyUrl) ??
              null;

            if (!selectedSite) {
              throw new Error("Search Console site secilmemis");
            }

            if (selectedSite.siteUrl !== gscIntegration.propertyUrl || !gscIntegration.metadata) {
              await db.integration.update({
                where: { id: gscIntegration.id },
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
            startDate.setDate(endDate.getDate() - 7); // Son 1 hafta
            const fmt = (d: Date) => d.toISOString().split("T")[0];

            const res = await searchconsole.searchanalytics.query({
              siteUrl: selectedSite.siteUrl,
              requestBody: { startDate: fmt(startDate), endDate: fmt(endDate), dimensions: ["query"], rowLimit: 50 },
            });

            for (const row of res.data.rows || []) {
              const keyword = row.keys?.[0];
              if (!keyword) continue;

              const existing = await db.keyword.findUnique({
                where: { projectId_keyword: { projectId: project.id, keyword } },
              });

              const newPosition = Math.round(row.position ?? 0);
              const prevPosition = existing?.position ?? null;
              const trend = prevPosition
                ? newPosition < prevPosition ? "UP" : newPosition > prevPosition ? "DOWN" : "STABLE"
                : "STABLE";

              await db.keyword.upsert({
                where: { projectId_keyword: { projectId: project.id, keyword } },
                update: {
                  position: newPosition,
                  prevPosition,
                  clicks: Math.round(row.clicks ?? 0),
                  impressions: Math.round(row.impressions ?? 0),
                  ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : null,
                  source: "GOOGLE_SEARCH_CONSOLE",
                  trend: trend as "UP" | "DOWN" | "STABLE",
                },
                create: {
                  projectId: project.id, keyword, position: newPosition,
                  clicks: Math.round(row.clicks ?? 0),
                  impressions: Math.round(row.impressions ?? 0),
                  ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : null,
                  source: "GOOGLE_SEARCH_CONSOLE", trend: "STABLE",
                },
              });

              const kw = await db.keyword.findUnique({
                where: { projectId_keyword: { projectId: project.id, keyword } },
              });
              if (kw) {
                await db.keywordHistory.create({ data: { keywordId: kw.id, position: newPosition, volume: kw.volume } });
              }
              keywordsSynced++;
            }
          }

          projectResult.keywords = { synced: keywordsSynced };
        } catch {
          projectResult.keywords = { error: "Keyword sync başarısız" };
        }

        // ========== 3. AI VISIBILITY (AI sağlayıcı varsa) ==========
        let visibilityChecked = 0;
        try {
          const { checkAiVisibility, getDefaultProvider } = await import("@/lib/ai");
          const defaultProvider = getDefaultProvider();

          if (defaultProvider) {
            const topKeywords = await db.keyword.findMany({
              where: { projectId: project.id, position: { not: null } },
              orderBy: { position: "asc" },
              take: 3, // Haftalık kontrolde 3 keyword yeterli (API maliyeti)
            });

            const prevVisibility = await db.aiVisibility.findMany({
              where: { projectId: project.id },
              orderBy: { measuredAt: "desc" },
              distinct: ["platform"],
            });
            const prevMap = new Map(prevVisibility.map(v => [v.platform, v.visibility]));

            let totalMentions = 0;
            let totalChecks = 0;

            for (const kw of topKeywords) {
              try {
                const result = await checkAiVisibility(kw.keyword, project.domain, defaultProvider);
                totalChecks++;
                if (result?.mentioned) {
                  totalMentions++;
                  // Citation kaydet
                  const page = await db.page.findFirst({
                    where: { projectId: project.id },
                    orderBy: { lastCrawl: "desc" },
                  });
                  if (page) {
                    await db.citation.create({
                      data: {
                        pageId: page.id,
                        platform: defaultProvider === "claude" ? "CLAUDE" : defaultProvider === "openai" ? "CHATGPT" : "GOOGLE_AI_OVERVIEW",
                        query: kw.keyword,
                        snippet: result.snippet,
                        position: result.position,
                      },
                    });
                  }
                }
              } catch { /* tek sorgu hatası */ }
            }

            if (totalChecks > 0) {
              const visibility = Math.round((totalMentions / totalChecks) * 100);
              const platform = defaultProvider === "claude" ? "CLAUDE" as const : defaultProvider === "openai" ? "CHATGPT" as const : "GOOGLE_AI_OVERVIEW" as const;
              const prevVis = prevMap.get(platform) ?? 0;

              await db.aiVisibility.create({
                data: {
                  projectId: project.id,
                  platform,
                  visibility,
                  citations: totalMentions,
                  change: visibility - prevVis,
                },
              });
              visibilityChecked = totalChecks;
            }
          }

          projectResult.visibility = { checked: visibilityChecked };
        } catch {
          projectResult.visibility = { error: "Visibility check başarısız" };
        }

        // ========== 4. BACKLINK GÜNCELLEMESİ ==========
        let backlinkCount = 0;
        if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
          try {
            const { getBacklinkSummary } = await import("@/lib/dataforseo");
            const bl = await getBacklinkSummary(project.domain);
            backlinkCount = bl.totalBacklinks;
            projectResult.backlinks = { total: bl.totalBacklinks, domains: bl.referringDomains, rank: bl.domainRank };
          } catch {
            projectResult.backlinks = { error: "Backlink verisi alınamadı" };
          }
        }

        // ========== 5. SKORLARI AL ==========
        const lastSeo = await db.seoScore.findFirst({ where: { projectId: project.id }, orderBy: { measuredAt: "desc" } });
        const lastGeo = await db.geoScore.findFirst({ where: { projectId: project.id, pageId: null }, orderBy: { measuredAt: "desc" } });
        const keywordCount = await db.keyword.count({ where: { projectId: project.id } });

        // ========== 6. E-POSTA ==========
        if (project.user.email) {
          const emailHtml = buildWeeklyReportEmail({
            domain: project.domain,
            seoScore: Math.round(lastSeo?.overallScore ?? 0),
            geoScore: Math.round(lastGeo?.overallScore ?? 0),
            keywords: keywordCount,
            issues: crawlIssues,
          });
          await sendEmail(project.user.email, `SEO.GEO Haftalık Rapor — ${project.domain}`, emailHtml);
        }

        // ========== 7. BİLDİRİM ==========
        await db.alert.create({
          data: {
            projectId: project.id,
            userId: project.userId,
            type: "INFO",
            message: `Haftalık güncelleme tamamlandı — ${crawlIssues} sorun, ${keywordsSynced} keyword güncellendi${visibilityChecked > 0 ? `, ${visibilityChecked} AI visibility kontrolü` : ""}`,
          },
        });

        results.push({ ...projectResult, success: true });
      } catch (e) {
        results.push({ project: project.domain, success: false, error: String(e) });
      }
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    console.error("Cron error:", error);
    return NextResponse.json({ error: "Cron job başarısız" }, { status: 500 });
  }
}
