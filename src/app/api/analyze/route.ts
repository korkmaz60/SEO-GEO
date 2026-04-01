import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { db } from "@/lib/db";

const PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

// Türkçe stopword listesi — keyword extraction'da filtre
const STOPWORDS = new Set([
  "home", "anasayfa", "giriş", "login", "admin", "panel", "about", "hakkımızda",
  "iletişim", "contact", "blog", "page", "sayfa", "test", "null", "undefined",
  "untitled", "başlıksız", "hoşgeldiniz", "welcome", "index", "default",
]);

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const domain = ctx.project.domain;
    const targetUrl = `https://${domain}`;
    const results: Record<string, unknown> = {};

    // ========== 0. SAYFA KEŞFİ ==========
    try {
      const sitemapRes = await fetch(`${targetUrl}/sitemap.xml`, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SEO-GEO-Bot/1.0" } });
      if (sitemapRes.ok) {
        const xml = await sitemapRes.text();
        const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => !u.includes("sitemap"));
        let saved = 0;
        for (const u of urls.slice(0, 100)) {
          try {
            const path = new URL(u).pathname;
            await db.page.upsert({
              where: { projectId_url: { projectId: ctx.projectId, url: path } },
              update: { status: "ACTIVE" },
              create: { projectId: ctx.projectId, url: path, title: path, status: "ACTIVE", source: "SITEMAP" },
            });
            saved++;
          } catch { /* */ }
        }
        results.discover = { pages: saved, source: "sitemap" };
      }
    } catch {
      results.discover = { pages: 0, source: "none" };
    }

    // ========== 1. SAYFA TARAMASI — TEK FETCH ==========
    // HTML'i bir kez çek, tüm analizlerde paylaş
    let fetchedHtml: string | null = null;
    let fetchResponseTime = 0;

    let crawlData: {
      title: string; desc: string; hasSchema: boolean; schemaTypes: string[];
      hasCanonical: boolean; hasAuthor: boolean; hasSources: boolean; hasStats: boolean;
      hasFaq: boolean; hasHowTo: boolean; hasLlmsTxt: boolean;
      headingCount: number; listCount: number; tableCount: number;
      wordCount: number; issueCount: number; h1: string;
      internalLinkCount: number; externalLinkCount: number;
      responseTime: number;
    } | null = null;

    try {
      const crawlSession = await db.crawlSession.create({
        data: { projectId: ctx.projectId, status: "RUNNING" },
      });

      const startTime = Date.now();
      const pageRes = await fetch(targetUrl, {
        headers: { "User-Agent": "SEO-GEO-Crawler/1.0" },
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
      });
      fetchResponseTime = Date.now() - startTime;
      fetchedHtml = await pageRes.text();
      const html = fetchedHtml;

      // Meta analiz
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const title = titleMatch?.[1]?.trim() || "";
      const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
      const desc = descMatch?.[1]?.trim() || "";
      const h1s = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
      const h1 = h1s[0]?.replace(/<[^>]+>/g, "").trim() || "";
      const imgs = html.match(/<img[^>]*>/gi) || [];
      const imgsNoAlt = imgs.filter((img) => !img.includes("alt=") || img.match(/alt=["']\s*["']/));
      const hasCanonical = /<link\s+rel=["']canonical["']/i.test(html);
      const hasViewport = /<meta\s+name=["']viewport["']/i.test(html);
      const robotsNoindex = /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html);

      // Schema analizi
      const schemaScripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
      const schemaTypes: string[] = [];
      for (const m of schemaScripts) {
        try {
          const parsed = JSON.parse(m[1]);
          const t = parsed["@type"];
          if (Array.isArray(t)) schemaTypes.push(...t);
          else if (t) schemaTypes.push(t);
        } catch { /* */ }
      }
      const hasSchema = schemaScripts.length > 0 || html.includes("itemtype=");
      const hasFaq = schemaTypes.some(t => t.toLowerCase().includes("faq"));
      const hasHowTo = schemaTypes.some(t => t.toLowerCase().includes("howto"));

      // İçerik metrikleri
      const cleanText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
      const headingCount = (html.match(/<h[2-6][^>]*>/gi) || []).length;
      const listCount = (html.match(/<[uo]l[^>]*>/gi) || []).length;
      const tableCount = (html.match(/<table[^>]*>/gi) || []).length;

      // E-E-A-T sinyalleri
      const hasAuthor = /author|yazar|yazan/i.test(html) || html.includes('"author"');
      const hasSources = /kaynak|referans|source|reference|araştırma/i.test(cleanText);
      const hasStats = (cleanText.match(/\d+[%.,]\d*|\b\d{4}\b|\b\d+\s*(milyon|milyar|bin)/g) || []).length >= 3;

      // Link analizi
      const hrefMatches = html.match(/href=["'](\/[^"']*|https?:\/\/[^"']*?)["']/gi) || [];
      const allLinks = hrefMatches.map((m) => m.match(/href=["'](.*?)["']/)?.[1]).filter(Boolean);
      const internalLinkCount = allLinks.filter(l => l!.startsWith("/") || l!.includes(domain)).length;
      const externalLinkCount = allLinks.filter(l => l!.startsWith("http") && !l!.includes(domain)).length;

      // llms.txt kontrolü
      let hasLlmsTxt = false;
      try {
        const llmsRes = await fetch(`${targetUrl}/llms.txt`, { signal: AbortSignal.timeout(3000) });
        hasLlmsTxt = llmsRes.ok;
      } catch { /* */ }

      // Sorunları kaydet
      const issues: { category: string; severity: "CRITICAL" | "WARNING" | "NOTICE" | "INFO"; message: string }[] = [];
      if (!title) issues.push({ category: "Meta Başlık", severity: "CRITICAL", message: "Title etiketi bulunamadı" });
      else if (title.length > 60) issues.push({ category: "Meta Başlık", severity: "WARNING", message: `Title çok uzun (${title.length} karakter)` });
      if (!desc) issues.push({ category: "Meta Açıklama", severity: "WARNING", message: "Meta description bulunamadı" });
      else if (desc.length > 160) issues.push({ category: "Meta Açıklama", severity: "WARNING", message: `Description çok uzun (${desc.length} karakter)` });
      if (h1s.length === 0) issues.push({ category: "H1 Etiketi", severity: "WARNING", message: "H1 etiketi bulunamadı" });
      else if (h1s.length > 1) issues.push({ category: "H1 Etiketi", severity: "NOTICE", message: `${h1s.length} adet H1 var` });
      if (!hasCanonical) issues.push({ category: "Canonical", severity: "WARNING", message: "Canonical etiketi eksik" });
      if (!hasSchema) issues.push({ category: "Schema Markup", severity: "WARNING", message: "Yapısal veri bulunamadı" });
      if (!hasViewport) issues.push({ category: "Viewport", severity: "WARNING", message: "Viewport meta eksik" });
      if (robotsNoindex) issues.push({ category: "Robots", severity: "CRITICAL", message: "Sayfa noindex ile işaretli" });
      if (imgsNoAlt.length > 0) issues.push({ category: "Görsel Alt Metin", severity: "WARNING", message: `${imgsNoAlt.length}/${imgs.length} görselde alt metin eksik` });
      if (wordCount < 300) issues.push({ category: "İçerik", severity: "WARNING", message: `Ana sayfa içeriği az (${wordCount} kelime)` });
      if (fetchResponseTime > 3000) issues.push({ category: "Sayfa Hızı", severity: "WARNING", message: `Yavaş yanıt süresi (${(fetchResponseTime / 1000).toFixed(1)}s)` });

      for (const issue of issues) {
        await db.technicalIssue.create({ data: { crawlId: crawlSession.id, ...issue } });
      }

      await db.page.upsert({
        where: { projectId_url: { projectId: ctx.projectId, url: "/" } },
        update: { title, lastCrawl: new Date(), status: "ACTIVE", wordCount },
        create: { projectId: ctx.projectId, url: "/", title, status: "ACTIVE", wordCount },
      });

      await db.crawlSession.update({
        where: { id: crawlSession.id },
        data: { pagesScanned: 1, issuesFound: issues.length, status: "COMPLETED", finishedAt: new Date() },
      });

      crawlData = {
        title, desc, hasSchema, schemaTypes, hasCanonical, hasAuthor, hasSources,
        hasStats, hasFaq, hasHowTo, hasLlmsTxt, headingCount, listCount, tableCount,
        wordCount, issueCount: issues.length, h1, internalLinkCount, externalLinkCount,
        responseTime: fetchResponseTime,
      };

      results.crawl = { issues: issues.length, title, hasSchema, hasCanonical, wordCount };
    } catch (e) {
      console.error("Crawl error:", e);
      results.crawl = { error: "Site taranamadı — URL erişilebilir olmalı" };
    }

    // ========== 1.5 OTOMATİK KEYWORD ÇIKARMA (stopword filtreli) ==========
    if (crawlData) {
      try {
        const extractedKeywords: string[] = [];

        // Title'dan keyword çıkar
        if (crawlData.title) {
          const titleKw = crawlData.title
            .split(/[-|–—:]/)[0]
            .trim()
            .toLowerCase();
          if (titleKw.length > 3 && titleKw.length < 60 && !isStopword(titleKw)) {
            extractedKeywords.push(titleKw);
          }
        }

        // H1'den keyword çıkar
        if (crawlData.h1) {
          const h1Kw = crawlData.h1.toLowerCase().trim();
          if (h1Kw.length > 3 && h1Kw.length < 60 && !isStopword(h1Kw) && !extractedKeywords.includes(h1Kw)) {
            extractedKeywords.push(h1Kw);
          }
        }

        // Meta description'dan anahtar ifadeler çıkar
        if (crawlData.desc) {
          const descPhrases = crawlData.desc
            .toLowerCase()
            .split(/[,.;!?]/)
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 5 && p.length < 50 && p.split(/\s+/).length >= 2 && p.split(/\s+/).length <= 6)
            .filter((p: string) => !isStopword(p));
          for (const phrase of descPhrases.slice(0, 3)) {
            if (!extractedKeywords.includes(phrase)) extractedKeywords.push(phrase);
          }
        }

        // Domain adından keyword
        const domainName = domain.replace(/\.(com|net|org|io|app|dev|co|tr).*$/i, "");
        if (domainName.length > 2 && !isStopword(domainName) && !extractedKeywords.some(k => k.includes(domainName))) {
          extractedKeywords.push(domainName);
        }

        // Mevcut keyword'leri kontrol et ve yenilerini ekle
        let addedCount = 0;
        for (const kw of extractedKeywords) {
          const exists = await db.keyword.findFirst({
            where: { projectId: ctx.projectId, keyword: { equals: kw, mode: "insensitive" } },
          });
          if (!exists) {
            await db.keyword.create({
              data: { projectId: ctx.projectId, keyword: kw, tracked: true, trend: "STABLE" },
            });
            addedCount++;
          }
        }

        results.keywords = { extracted: extractedKeywords.length, added: addedCount };
      } catch {
        results.keywords = { extracted: 0, added: 0 };
      }
    }

    // ========== 2. PAGESPEED TESTİ ==========
    let speedMobile = 0;
    let speedDesktop = 0;
    let lcpValue: number | null = null;
    let clsValue: number | null = null;
    let inpValue: number | null = null;

    try {
      const psApiKey = process.env.GOOGLE_PAGESPEED_KEY || process.env.GEMINI_API_KEY || "";
      const psKeyParam = psApiKey ? `&key=${psApiKey}` : "";
      const [mobileRes, desktopRes] = await Promise.all([
        fetch(`${PAGESPEED_API}?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=performance${psKeyParam}`),
        fetch(`${PAGESPEED_API}?url=${encodeURIComponent(targetUrl)}&strategy=desktop&category=performance${psKeyParam}`),
      ]);

      if (mobileRes.ok && desktopRes.ok) {
        const [mobileData, desktopData] = await Promise.all([mobileRes.json(), desktopRes.json()]);

        speedMobile = Math.round((mobileData.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
        speedDesktop = Math.round((desktopData.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
        const mobileAudits = mobileData.lighthouseResult?.audits || {};
        lcpValue = mobileAudits["largest-contentful-paint"]?.numericValue ? Number((mobileAudits["largest-contentful-paint"].numericValue / 1000).toFixed(2)) : null;
        clsValue = mobileAudits["cumulative-layout-shift"]?.numericValue ? Number(mobileAudits["cumulative-layout-shift"].numericValue.toFixed(3)) : null;
        inpValue = mobileAudits["interaction-to-next-paint"]?.numericValue
          ? Math.round(mobileAudits["interaction-to-next-paint"].numericValue)
          : mobileAudits["total-blocking-time"]?.numericValue
            ? Math.round(mobileAudits["total-blocking-time"].numericValue)
            : null;

        results.pagespeed = { mobile: speedMobile, desktop: speedDesktop };
      } else {
        results.pagespeed = { error: "PageSpeed API hatası" };
      }
    } catch (e) {
      console.error("PageSpeed error:", e);
      results.pagespeed = { error: "PageSpeed testi başarısız" };
    }

    // ========== 3. BACKLINK VERİSİ (DataForSEO varsa) ==========
    let backlinkData: { totalBacklinks: number; referringDomains: number; domainRank: number } | null = null;
    if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
      try {
        const { getBacklinkSummary } = await import("@/lib/dataforseo");
        const bl = await getBacklinkSummary(domain);
        backlinkData = { totalBacklinks: bl.totalBacklinks, referringDomains: bl.referringDomains, domainRank: bl.domainRank };

        // Backlink snapshot kaydet
        await db.backlinkSnapshot.create({
          data: {
            projectId: ctx.projectId,
            totalBacklinks: bl.totalBacklinks,
            referringDomains: bl.referringDomains,
            domainRank: bl.domainRank,
          },
        });

        results.backlinks = backlinkData;
      } catch (e) {
        console.error("Backlink API error:", e);
        results.backlinks = { error: "Backlink verisi alınamadı" };
      }
    }

    // ========== 4. SEO SKOR HESAPLA ==========
    try {
      const hasBacklinkData = backlinkData !== null;
      const seoScore = calculateSeoScore({
        speedMobile,
        speedDesktop,
        lcpValue,
        clsValue,
        inpValue,
        crawlIssues: crawlData?.issueCount ?? 0,
        hasSchema: crawlData?.hasSchema ?? false,
        hasCanonical: crawlData?.hasCanonical ?? false,
        wordCount: crawlData?.wordCount ?? 0,
        headingCount: crawlData?.headingCount ?? 0,
        internalLinkCount: crawlData?.internalLinkCount ?? 0,
        externalLinkCount: crawlData?.externalLinkCount ?? 0,
        referringDomains: backlinkData?.referringDomains ?? null,
        domainRank: backlinkData?.domainRank ?? null,
        responseTime: crawlData?.responseTime ?? 0,
        hasBacklinkData,
      });

      await db.seoScore.create({
        data: {
          projectId: ctx.projectId,
          overallScore: seoScore.overall,
          healthScore: seoScore.health,
          speedMobile,
          speedDesktop,
          lcpValue,
          fidValue: inpValue,
          clsValue,
        },
      });

      results.seo = seoScore;
    } catch (e) {
      console.error("SEO score error:", e);
      results.seo = { error: "SEO skor hesaplanamadı" };
    }

    // ========== 5. GEO SKOR HESAPLA — fetchedHtml'i yeniden kullan ==========
    try {
      let geoScore;

      // AI varsa AI ile detaylı GEO analizi yap — fetchedHtml'i paylaş (yeniden fetch yok!)
      if (fetchedHtml && crawlData && (process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY)) {
        try {
          const { analyzePageGeo } = await import("@/lib/ai");
          const aiResult = await analyzePageGeo(fetchedHtml, targetUrl, domain);
          if (aiResult?.scores) {
            geoScore = {
              overall: Math.round(aiResult.scores.overall),
              authority: Math.round(aiResult.scores.authority),
              readability: Math.round(aiResult.scores.readability),
              structure: Math.round(aiResult.scores.structure),
              technical: Math.round(aiResult.scores.technical),
              source: "ai",
            };
          }
        } catch (e) {
          console.error("GEO AI analysis error:", e);
          // AI başarısız → lokal hesaplama yapılacak
        }
      }

      // AI yoksa veya başarısızsa lokal hesaplama
      if (!geoScore && crawlData) {
        geoScore = calculateGeoScore(crawlData);
      }

      if (geoScore) {
        await db.geoScore.create({
          data: {
            projectId: ctx.projectId,
            overallScore: geoScore.overall,
            authorityScore: geoScore.authority,
            readabilityScore: geoScore.readability,
            structureScore: geoScore.structure,
            technicalScore: geoScore.technical,
          },
        });
        results.geo = geoScore;
      }
    } catch (e) {
      console.error("GEO score error:", e);
      results.geo = { error: "GEO skor hesaplanamadı" };
    }

    // ========== 6. BİLDİRİM ==========
    try {
      await db.alert.create({
        data: {
          projectId: ctx.projectId,
          userId: ctx.userId,
          type: "SUCCESS",
          message: `${domain} sitesi başarıyla analiz edildi`,
        },
      });
    } catch { /* */ }

    return NextResponse.json({ success: true, domain, results });
  } catch (error) {
    console.error("Analyze error:", error);
    return NextResponse.json({ error: "Analiz başarısız" }, { status: 500 });
  }
}

/** Stopword kontrolü */
function isStopword(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  if (STOPWORDS.has(normalized)) return true;
  // Tek kelime ve çok kısa ise muhtemelen stopword
  if (normalized.split(/\s+/).length === 1 && normalized.length <= 3) return true;
  return false;
}

// ============================================
// SEO SKOR FORMÜLÜ
// ============================================

interface SeoInput {
  speedMobile: number; speedDesktop: number;
  lcpValue: number | null; clsValue: number | null; inpValue: number | null;
  crawlIssues: number;
  hasSchema: boolean; hasCanonical: boolean;
  wordCount: number; headingCount: number;
  internalLinkCount: number; externalLinkCount: number;
  referringDomains: number | null; domainRank: number | null;
  responseTime: number;
  hasBacklinkData: boolean;
}

function calculateSeoScore(input: SeoInput) {
  // 1. Technical Health (0-100) — %20
  let technicalHealth = 100;
  if (!input.hasCanonical) technicalHealth -= 15;
  if (!input.hasSchema) technicalHealth -= 10;
  if (input.crawlIssues >= 10) technicalHealth -= 30;
  else if (input.crawlIssues >= 5) technicalHealth -= 20;
  else if (input.crawlIssues >= 2) technicalHealth -= 10;
  technicalHealth = Math.max(0, technicalHealth);

  // 2. Page Experience (0-100) — %20
  const speedScore = Math.round((input.speedMobile + input.speedDesktop) / 2);
  let cwvScore = 100;
  if (input.lcpValue !== null) {
    if (input.lcpValue > 4) cwvScore -= 30;
    else if (input.lcpValue > 2.5) cwvScore -= 15;
  }
  if (input.clsValue !== null) {
    if (input.clsValue > 0.25) cwvScore -= 30;
    else if (input.clsValue > 0.1) cwvScore -= 15;
  }
  if (input.inpValue !== null) {
    if (input.inpValue > 500) cwvScore -= 30;
    else if (input.inpValue > 200) cwvScore -= 15;
  }
  if (input.responseTime > 3000) cwvScore -= 10;
  cwvScore = Math.max(0, cwvScore);
  const pageExperience = Math.round(speedScore * 0.5 + cwvScore * 0.5);

  // 3. Content Signals (0-100) — %20
  let contentScore = 0;
  if (input.wordCount >= 2000) contentScore += 35;
  else if (input.wordCount >= 1000) contentScore += 25;
  else if (input.wordCount >= 500) contentScore += 15;
  else if (input.wordCount >= 300) contentScore += 8;

  if (input.headingCount >= 5) contentScore += 25;
  else if (input.headingCount >= 3) contentScore += 15;
  else if (input.headingCount >= 1) contentScore += 8;

  if (input.internalLinkCount >= 10) contentScore += 20;
  else if (input.internalLinkCount >= 5) contentScore += 12;
  else if (input.internalLinkCount >= 2) contentScore += 6;

  if (input.externalLinkCount >= 3) contentScore += 20;
  else if (input.externalLinkCount >= 1) contentScore += 10;

  contentScore = Math.min(100, contentScore);

  // 4. Backlink Profile (0-100) — %20
  // "Veri yok" vs "0" ayrımı: hasBacklinkData false ise skoru diğer metriklerden tahmin et
  let backlinkScore: number;
  if (!input.hasBacklinkData) {
    // Backlink verisi yok — diğer sinyallerden makul bir tahmin yap
    // Ama bunu "tahmin" olarak işaretle, 0 gösterme
    backlinkScore = Math.round(technicalHealth * 0.3 + pageExperience * 0.2 + 20);
  } else {
    backlinkScore = 0;
    const rd = input.referringDomains ?? 0;
    if (rd >= 100) backlinkScore = 90;
    else if (rd >= 50) backlinkScore = 70;
    else if (rd >= 20) backlinkScore = 55;
    else if (rd >= 10) backlinkScore = 40;
    else if (rd >= 5) backlinkScore = 25;
    else if (rd >= 1) backlinkScore = 15;
    const dr = input.domainRank ?? 0;
    if (dr >= 50) backlinkScore += 10;
    else if (dr >= 30) backlinkScore += 5;
  }
  backlinkScore = Math.min(100, backlinkScore);

  // 5. Indexing & Technical SEO (0-100) — %20
  let indexScore = 70;
  if (input.hasSchema) indexScore += 10;
  if (input.hasCanonical) indexScore += 10;
  if (input.crawlIssues === 0) indexScore += 10;
  indexScore = Math.min(100, indexScore);

  const overall = Math.round(
    technicalHealth * 0.20 +
    pageExperience * 0.20 +
    contentScore * 0.20 +
    backlinkScore * 0.20 +
    indexScore * 0.20
  );

  const criticalPenalty = Math.min(input.crawlIssues * 5, 50);
  const health = Math.max(0, 100 - criticalPenalty);

  return {
    overall,
    health,
    technicalHealth,
    pageExperience,
    contentScore,
    backlinkScore,
    backlinkDataAvailable: input.hasBacklinkData,
    indexScore,
  };
}

// ============================================
// GEO SKOR FORMÜLÜ (Lokal)
// ============================================

interface GeoInput {
  hasSchema: boolean; schemaTypes: string[];
  hasCanonical: boolean; hasAuthor: boolean;
  hasSources: boolean; hasStats: boolean;
  hasFaq: boolean; hasHowTo: boolean;
  hasLlmsTxt: boolean;
  headingCount: number; listCount: number; tableCount: number;
  wordCount: number; title: string; h1: string; desc: string;
  internalLinkCount: number; externalLinkCount: number;
  issueCount: number; responseTime: number;
}

function calculateGeoScore(input: GeoInput) {
  // Authority (0-100) — %30
  let authority = 20;
  if (input.hasAuthor) authority += 20;
  if (input.hasSources) authority += 15;
  if (input.hasStats) authority += 15;
  if (input.wordCount >= 2000) authority += 15;
  else if (input.wordCount >= 1000) authority += 10;
  else if (input.wordCount >= 500) authority += 5;
  if (input.externalLinkCount >= 3) authority += 10;
  else if (input.externalLinkCount >= 1) authority += 5;
  if (input.title && input.title.length >= 30 && input.title.length <= 60) authority += 5;
  authority = Math.min(100, authority);

  // Readability (0-100) — %25
  let readability = 30;
  if (input.wordCount >= 800 && input.wordCount <= 3000) readability += 20;
  else if (input.wordCount >= 500) readability += 10;
  if (input.headingCount >= 5) readability += 20;
  else if (input.headingCount >= 3) readability += 15;
  else if (input.headingCount >= 1) readability += 8;
  if (input.desc && input.h1) readability += 10;
  if (input.listCount >= 2) readability += 10;
  else if (input.listCount >= 1) readability += 5;
  if (input.tableCount >= 1) readability += 10;
  readability = Math.min(100, readability);

  // Structure (0-100) — %25
  let structure = 15;
  if (input.hasSchema) structure += 10;
  if (input.hasFaq) structure += 15;
  if (input.hasHowTo) structure += 15;
  if (input.schemaTypes.length >= 3) structure += 10;
  else if (input.schemaTypes.length >= 1) structure += 5;
  if (input.headingCount >= 5) structure += 15;
  else if (input.headingCount >= 3) structure += 10;
  if (input.listCount >= 2) structure += 10;
  if (input.tableCount >= 1) structure += 10;
  if (input.internalLinkCount >= 5) structure += 10;
  else if (input.internalLinkCount >= 2) structure += 5;
  structure = Math.min(100, structure);

  // Technical (0-100) — %20
  let technical = 25;
  if (input.hasSchema) technical += 15;
  if (input.hasCanonical) technical += 10;
  if (input.hasLlmsTxt) technical += 15;
  if (input.issueCount === 0) technical += 15;
  else if (input.issueCount <= 2) technical += 10;
  else if (input.issueCount <= 5) technical += 5;
  if (input.responseTime < 1000) technical += 10;
  else if (input.responseTime < 2000) technical += 5;
  if (input.title) technical += 5;
  if (input.desc) technical += 5;
  technical = Math.min(100, technical);

  const overall = Math.round(authority * 0.3 + readability * 0.25 + structure * 0.25 + technical * 0.2);

  return { overall, authority, readability, structure, technical, source: "local" };
}
