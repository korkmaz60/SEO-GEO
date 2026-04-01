import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";
import { getAuthenticatedClient } from "@/lib/google-auth";
import { google } from "googleapis";

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    let gscSynced = 0;
    let serperSynced = 0;
    let difficultyUpdated = 0;

    // ========== 1. GOOGLE SEARCH CONSOLE ==========
    const gscIntegration = await db.integration.findUnique({
      where: { projectId_provider: { projectId: ctx.projectId, provider: "GOOGLE_SEARCH_CONSOLE" } },
    });

    if (gscIntegration?.refreshToken) {
      try {
        const client = getAuthenticatedClient(gscIntegration.accessToken, gscIntegration.refreshToken);
        const searchconsole = google.searchconsole({ version: "v1", auth: client });

        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 28);
        const fmt = (d: Date) => d.toISOString().split("T")[0];

        const res = await searchconsole.searchanalytics.query({
          siteUrl: `sc-domain:${ctx.project.domain}`,
          requestBody: {
            startDate: fmt(startDate),
            endDate: fmt(endDate),
            dimensions: ["query"],
            rowLimit: 100,
          },
        });

        for (const row of res.data.rows || []) {
          const keyword = row.keys?.[0];
          if (!keyword) continue;

          // GSC sorgu kalite filtresi — düşük kaliteli sorguları atla
          if (!isQualityQuery(keyword, row.impressions ?? 0, row.clicks ?? 0)) continue;

          const existing = await db.keyword.findUnique({
            where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
          });

          // GSC pozisyonu 28 günlük ortalamadır, anlık sıralama değildir
          // Yine de round ediyoruz çünkü DB integer tutuyor, ama bu bir ortalama
          const rawPosition = row.position ?? null;
          const newPosition = rawPosition !== null ? Math.round(rawPosition) : null;
          const prevPosition = existing?.position ?? null;
          const trend = (prevPosition && newPosition)
            ? newPosition < prevPosition ? "UP" : newPosition > prevPosition ? "DOWN" : "STABLE"
            : "STABLE";

          // İntent classification
          const intent = classifyIntent(keyword);

          await db.keyword.upsert({
            where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
            update: {
              position: newPosition,
              prevPosition,
              // volume alanı artık impressions ile doldurulmuyor — GSC'den gerçek volume gelmez
              // impressions ayrı alan olarak kalır, volume DataForSEO'dan gelecek
              clicks: Math.round(row.clicks ?? 0),
              impressions: Math.round(row.impressions ?? 0),
              ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : null,
              source: "GOOGLE_SEARCH_CONSOLE",
              trend: trend as "UP" | "DOWN" | "STABLE",
            },
            create: {
              projectId: ctx.projectId,
              keyword,
              position: newPosition,
              clicks: Math.round(row.clicks ?? 0),
              impressions: Math.round(row.impressions ?? 0),
              ctr: row.ctr ? Number((row.ctr * 100).toFixed(2)) : null,
              source: "GOOGLE_SEARCH_CONSOLE",
              tracked: false, // GSC sorguları organik — kullanıcı takibe alana kadar
              trend: "STABLE",
            },
          });

          // History kaydet
          const kw = await db.keyword.findUnique({
            where: { projectId_keyword: { projectId: ctx.projectId, keyword } },
          });
          if (kw && newPosition !== null) {
            await db.keywordHistory.create({
              data: { keywordId: kw.id, position: newPosition, volume: kw.volume },
            });
          }

          gscSynced++;
        }
      } catch (e) {
        console.error("GSC sync error:", e);
      }
    }

    // ========== 2. SERPAPI (Manuel eklenen kelimeler) ==========
    if (process.env.SERPAPI_KEY) {
      try {
        const { checkDomainPosition } = await import("@/lib/serper");

        const manualKeywords = await db.keyword.findMany({
          where: { projectId: ctx.projectId, source: { in: ["MANUAL", "SERPER"] } },
        });

        for (const kw of manualKeywords) {
          try {
            const result = await checkDomainPosition(kw.keyword, ctx.project.domain);
            const newPosition = result.position;
            const prevPosition = kw.position;
            const trend = prevPosition && newPosition
              ? newPosition < prevPosition ? "UP" : newPosition > prevPosition ? "DOWN" : "STABLE"
              : "STABLE";

            await db.keyword.update({
              where: { id: kw.id },
              data: {
                position: newPosition,
                prevPosition,
                source: "SERPER",
                trend: trend as "UP" | "DOWN" | "STABLE",
              },
            });

            if (newPosition) {
              await db.keywordHistory.create({
                data: { keywordId: kw.id, position: newPosition, volume: kw.volume },
              });
            }

            serperSynced++;
          } catch { /* tek keyword hatası, devam */ }
        }
      } catch (e) {
        console.error("Serper sync error:", e);
      }
    }

    // ========== 3. KEYWORD DIFFICULTY & VOLUME (DataForSEO varsa) ==========
    if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
      try {
        const { getKeywordData } = await import("@/lib/dataforseo");

        // Volume veya difficulty'si olmayan keyword'leri bul
        const needsData = await db.keyword.findMany({
          where: {
            projectId: ctx.projectId,
            OR: [{ volume: null }, { difficulty: null }],
          },
          take: 50, // DataForSEO batch limiti
        });

        if (needsData.length > 0) {
          const keywordTexts = needsData.map(k => k.keyword);
          const dataForseoResults = await getKeywordData(keywordTexts);

          for (const result of dataForseoResults) {
            if (result.keyword && result.volume > 0) {
              // Competition index'i difficulty olarak kullan (0-100)
              const difficulty = result.competitionIndex !== null
                ? Math.round(result.competitionIndex * 100)
                : estimateDifficulty(result.volume, result.competition);

              await db.keyword.updateMany({
                where: {
                  projectId: ctx.projectId,
                  keyword: result.keyword,
                },
                data: {
                  volume: result.volume,
                  difficulty,
                },
              });

              difficultyUpdated++;
            }
          }
        }
      } catch (e) {
        console.error("DataForSEO keyword data error:", e);
      }
    }

    // Bildirim
    await db.alert.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        type: "SUCCESS",
        message: `Sıralamalar güncellendi — GSC: ${gscSynced}, Serper: ${serperSynced}${difficultyUpdated > 0 ? `, Zorluk: ${difficultyUpdated}` : ""} kelime`,
      },
    });

    return NextResponse.json({
      gscSynced,
      serperSynced,
      difficultyUpdated,
      total: gscSynced + serperSynced,
    });
  } catch (error) {
    console.error("Keyword sync error:", error);
    return NextResponse.json({ error: "Senkronizasyon başarısız" }, { status: 500 });
  }
}

// ============================================
// GSC SORGU KALİTE FİLTRESİ
// ============================================
// GSC'den gelen ham sorguların tümünü keyword olarak kaydetmek yerine,
// kaliteli olanları filtrele. Typo'lar, tek gösterimlik sorgular, anlamsız
// sorgular atlanır.

function isQualityQuery(keyword: string, impressions: number, clicks: number): boolean {
  const kw = keyword.trim().toLowerCase();

  // 1. Çok kısa veya çok uzun sorgular
  if (kw.length < 3 || kw.length > 80) return false;

  // 2. Minimum etki — en az 5 gösterim VEYA en az 1 tıklama
  if (impressions < 5 && clicks < 1) return false;

  // 3. Tek karakter tekrarları / anlamsız sorgular (typo tespiti)
  // "aaa", "asdf", "qqq" gibi
  if (/^(.)\1{2,}$/.test(kw)) return false;

  // 4. Sadece sayı
  if (/^\d+$/.test(kw)) return false;

  // 5. URL formatında sorgular (navigasyon amaçlı, keyword değil)
  if (/^https?:\/\/|\.com|\.net|\.org|\.tr/.test(kw)) return false;

  // 6. Tek kelime ve çok kısa (genelde typo)
  const wordCount = kw.split(/\s+/).length;
  if (wordCount === 1 && kw.length < 4) return false;

  return true;
}

// ============================================
// INTENT CLASSIFICATION
// ============================================

function classifyIntent(keyword: string): "informational" | "transactional" | "navigational" | "commercial" {
  const kw = keyword.toLowerCase();

  // Transactional signals
  if (/\b(satın al|fiyat|ucuz|indirim|sipariş|kargo|buy|price|coupon|deal|order)\b/.test(kw)) {
    return "transactional";
  }

  // Navigational signals
  if (/\b(giriş|login|anasayfa|official|resmi|site)\b/.test(kw)) {
    return "navigational";
  }

  // Commercial investigation
  if (/\b(en iyi|karşılaştır|vs|versus|alternatif|review|yorum|değerlendirme|öneri|tavsiye)\b/.test(kw)) {
    return "commercial";
  }

  // Default: informational
  return "informational";
}

// ============================================
// DIFFICULTY ESTIMATION (DataForSEO yoksa)
// ============================================

function estimateDifficulty(volume: number, competition: string): number {
  let base = 30;

  // Volume bazlı tahmini zorluk
  if (volume >= 10000) base += 30;
  else if (volume >= 1000) base += 20;
  else if (volume >= 100) base += 10;

  // Competition sınıfı
  if (competition === "HIGH") base += 25;
  else if (competition === "MEDIUM") base += 15;
  else if (competition === "LOW") base += 5;

  return Math.min(100, base);
}
