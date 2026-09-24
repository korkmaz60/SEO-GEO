import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { db } from "@/lib/db";

const MAX_PAGES = 200;
const TIMEOUT = 15000;

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const domain = ctx.project.domain;
    const baseUrl = `https://${domain}`;

    const session = await db.crawlSession.create({
      data: { projectId: ctx.projectId, status: "RUNNING" },
    });

    const visited = new Set<string>();
    const queue: { url: string; depth: number; parent: string | null }[] = [{ url: baseUrl, depth: 0, parent: null }];
    const allIssues: CrawlIssue[] = [];
    const pageData: Map<string, { wordCount: number; title: string; responseTime: number; statusCode: number }> = new Map();
    const redirectChains: Map<string, string[]> = new Map();
    const titleMap: Map<string, string[]> = new Map(); // title → paths (duplicate tespiti)
    const orphanCandidates = new Set<string>(); // linklenmeyen sayfalar

    while (queue.length > 0 && visited.size < MAX_PAGES) {
      const { url, depth, parent } = queue.shift()!;
      const path = getPath(url, baseUrl);
      if (!path || visited.has(path)) continue;
      visited.add(path);

      try {
        const startTime = Date.now();
        const res = await fetch(url, {
          headers: { "User-Agent": "SEO-GEO-Crawler/1.0" },
          redirect: "follow",
          signal: AbortSignal.timeout(TIMEOUT),
        });
        const responseTime = Date.now() - startTime;

        // Redirect chain tespiti
        if (res.redirected && res.url !== url) {
          const chain = [url, res.url];
          redirectChains.set(path, chain);
          if (chain.length > 2) {
            allIssues.push({ category: "Yönlendirme Zinciri", severity: "WARNING", message: `${path} — ${chain.length} adımlı redirect zinciri`, pageUrl: path });
          }
        }

        if (!res.ok) {
          allIssues.push({ category: "HTTP Hatası", severity: "CRITICAL", message: `${path} — HTTP ${res.status}`, pageUrl: path });
          if (parent) {
            allIssues.push({ category: "Kırık Bağlantı", severity: "CRITICAL", message: `${parent} → ${path} kırık link (${res.status})`, pageUrl: parent });
          }
          continue;
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) continue;

        const html = await res.text();
        const pageIssues = analyzePage(html, path, domain, depth, responseTime);
        allIssues.push(...pageIssues);

        // Sayfa bilgileri
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        const title = titleMatch?.[1]?.trim() || path;
        const cleanText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

        pageData.set(path, { wordCount, title, responseTime, statusCode: res.status });

        // Duplicate title tespiti
        if (title && title !== path) {
          if (!titleMap.has(title)) titleMap.set(title, []);
          titleMap.get(title)!.push(path);
        }

        // DB kaydet
        const page = await db.page.upsert({
          where: { projectId_url: { projectId: ctx.projectId, url: path } },
          update: { title, wordCount, lastCrawl: new Date(), status: "ACTIVE" },
          create: { projectId: ctx.projectId, url: path, title, wordCount, status: "ACTIVE", source: "INTERNAL_LINK" },
        });

        // AI GEO analiz (varsa)
        if (process.env.ANTHROPIC_API_KEY && depth <= 1) {
          try {
            const { analyzePageGeo } = await import("@/lib/ai");
            const geoResult = await analyzePageGeo(html, `${baseUrl}${path}`, domain);
            if (geoResult?.scores) {
              await db.geoScore.create({
                data: {
                  projectId: ctx.projectId,
                  pageId: page.id,
                  overallScore: geoResult.scores.overall,
                  authorityScore: geoResult.scores.authority,
                  readabilityScore: geoResult.scores.readability,
                  structureScore: geoResult.scores.structure,
                  technicalScore: geoResult.scores.technical,
                },
              });
            }
          } catch { /* AI hatası crawl'ı durdurmaz */ }
        }

        // Internal link'leri queue'ya ekle
        const links = extractInternalLinks(html, baseUrl, domain);
        for (const link of links) {
          const linkPath = getPath(link, baseUrl);
          if (linkPath && !visited.has(linkPath)) {
            queue.push({ url: link, depth: depth + 1, parent: path });
          }
        }
      } catch {
        allIssues.push({ category: "Erişim Hatası", severity: "WARNING", message: `${path} — zaman aşımı veya erişim hatası`, pageUrl: path });
      }
    }

    // ========== POST-CRAWL ANALİZLER ==========

    // Duplicate title tespiti
    for (const [title, paths] of titleMap) {
      if (paths.length > 1) {
        allIssues.push({
          category: "Duplicate Title",
          severity: "WARNING",
          message: `"${title.slice(0, 50)}" başlığı ${paths.length} sayfada tekrar ediyor`,
          pageUrl: paths[0],
          details: paths.join(", "),
        });
      }
    }

    // Thin content tespiti
    for (const [path, data] of pageData) {
      if (data.wordCount < 100) {
        allIssues.push({ category: "Thin Content", severity: "CRITICAL", message: `${path} — sadece ${data.wordCount} kelime`, pageUrl: path });
      } else if (data.wordCount < 300) {
        allIssues.push({ category: "Thin Content", severity: "WARNING", message: `${path} — ${data.wordCount} kelime (300+ önerilir)`, pageUrl: path });
      }
    }

    // Deep page tespiti (derinlik > 3)
    // queue'dan depth bilgisi — visited set'inde depth tutmuyoruz ama queue'da var
    // Bunun yerine page depth'i internal link yapısından çıkarabiliriz

    // Sorunları DB'ye kaydet
    for (const issue of allIssues) {
      const page = await db.page.findFirst({
        where: { projectId: ctx.projectId, url: issue.pageUrl },
      });
      await db.technicalIssue.create({
        data: {
          crawlId: session.id,
          pageId: page?.id ?? null,
          category: issue.category,
          severity: issue.severity,
          message: issue.message,
          details: issue.details || null,
        },
      });
    }

    // Session güncelle
    const criticalCount = allIssues.filter((i) => i.severity === "CRITICAL").length;
    const warningCount = allIssues.filter((i) => i.severity === "WARNING").length;

    await db.crawlSession.update({
      where: { id: session.id },
      data: {
        pagesScanned: visited.size,
        issuesFound: allIssues.length,
        status: "COMPLETED",
        finishedAt: new Date(),
      },
    });

    // ========== HEALTH SCORE HESAPLA ==========
    // Sorun ağırlıklı sağlık skoru: her CRITICAL -10, WARNING -3, NOTICE -1
    const maxScore = 100;
    const penalty = criticalCount * 10 + warningCount * 3 + allIssues.filter(i => i.severity === "NOTICE").length * 1;
    const healthScore = Math.max(0, Math.min(100, maxScore - penalty));

    // Bildirim
    await db.alert.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        type: criticalCount > 0 ? "WARNING" : "SUCCESS",
        message: `Site taraması tamamlandı: ${visited.size} sayfa, ${criticalCount} kritik, ${warningCount} uyarı`,
      },
    });

    return NextResponse.json({
      pagesScanned: visited.size,
      issuesFound: allIssues.length,
      critical: criticalCount,
      warnings: warningCount,
      healthScore,
      pages: Array.from(visited),
      duplicateTitles: [...titleMap.entries()].filter(([, paths]) => paths.length > 1).map(([title, paths]) => ({ title, pages: paths })),
      thinPages: [...pageData.entries()].filter(([, d]) => d.wordCount < 300).map(([path, d]) => ({ path, wordCount: d.wordCount })),
      slowPages: [...pageData.entries()].filter(([, d]) => d.responseTime > 2000).map(([path, d]) => ({ path, responseTime: d.responseTime })),
    });
  } catch (error) {
    console.error("Full crawl error:", error);
    return NextResponse.json({ error: "Tam tarama başarısız" }, { status: 500 });
  }
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

interface CrawlIssue {
  category: string;
  severity: "CRITICAL" | "WARNING" | "NOTICE" | "INFO";
  message: string;
  pageUrl: string;
  details?: string;
}

function getPath(url: string, baseUrl: string): string | null {
  try {
    const u = new URL(url, baseUrl);
    if (u.origin !== new URL(baseUrl).origin) return null;
    // Asset'leri atla
    const ext = u.pathname.split(".").pop()?.toLowerCase();
    if (ext && ["css", "js", "png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "woff2", "ttf", "eot", "pdf", "zip", "mp4", "mp3", "webp", "avif"].includes(ext)) return null;
    return u.pathname || "/";
  } catch {
    return null;
  }
}

function extractInternalLinks(html: string, baseUrl: string, domain: string): string[] {
  const links: string[] = [];
  const matches = html.matchAll(/href=["'](.*?)["']/gi);
  for (const m of matches) {
    const href = m[1];
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname === domain || resolved.hostname === `www.${domain}`) {
        links.push(resolved.href);
      }
    } catch { /* invalid URL */ }
  }
  return [...new Set(links)];
}

function analyzePage(html: string, path: string, domain: string, depth: number, responseTime: number): CrawlIssue[] {
  const issues: CrawlIssue[] = [];

  // Title
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  if (!title) issues.push({ category: "Meta Başlık", severity: "CRITICAL", message: `${path} — title etiketi yok`, pageUrl: path });
  else if (title.length > 60) issues.push({ category: "Meta Başlık", severity: "WARNING", message: `${path} — title çok uzun (${title.length})`, pageUrl: path });

  // Meta description
  const desc = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i)?.[1] || "";
  if (!desc) issues.push({ category: "Meta Açıklama", severity: "WARNING", message: `${path} — meta description yok`, pageUrl: path });

  // H1
  const h1s = html.match(/<h1[^>]*>/gi) || [];
  if (h1s.length === 0) issues.push({ category: "H1 Etiketi", severity: "WARNING", message: `${path} — H1 yok`, pageUrl: path });
  else if (h1s.length > 1) issues.push({ category: "H1 Etiketi", severity: "NOTICE", message: `${path} — ${h1s.length} H1 var`, pageUrl: path });

  // Canonical
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([\s\S]*?)["']/i);
  if (!canonical) {
    issues.push({ category: "Canonical", severity: "WARNING", message: `${path} — canonical etiketi yok`, pageUrl: path });
  } else if (canonical[1] && !canonical[1].includes(domain)) {
    issues.push({ category: "Canonical", severity: "CRITICAL", message: `${path} — canonical farklı domain'e yönleniyor`, pageUrl: path });
  }

  // Schema
  if (!html.includes("application/ld+json")) {
    issues.push({ category: "Schema", severity: "NOTICE", message: `${path} — yapısal veri yok`, pageUrl: path });
  }

  // Alt text
  const imgs = html.match(/<img[^>]*>/gi) || [];
  const noAlt = imgs.filter((img) => !img.includes("alt=") || /alt=["']\s*["']/.test(img));
  if (noAlt.length > 0) {
    issues.push({ category: "Alt Metin", severity: "WARNING", message: `${path} — ${noAlt.length}/${imgs.length} görselde alt metin eksik`, pageUrl: path });
  }

  // Response time
  if (responseTime > 3000) {
    issues.push({ category: "Sayfa Hızı", severity: "WARNING", message: `${path} — yavaş yanıt (${(responseTime / 1000).toFixed(1)}s)`, pageUrl: path });
  }

  // Page depth
  if (depth > 3) {
    issues.push({ category: "Sayfa Derinliği", severity: "NOTICE", message: `${path} — ana sayfadan ${depth} tık uzakta (ideal: ≤3)`, pageUrl: path });
  }

  // Robots noindex
  if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) {
    issues.push({ category: "Robots", severity: "CRITICAL", message: `${path} — noindex işaretli`, pageUrl: path });
  }

  // Mixed content
  if (html.match(/(?:src|href)=["']http:\/\/[^"']+["']/gi)?.length) {
    issues.push({ category: "Mixed Content", severity: "WARNING", message: `${path} — HTTP kaynaklar var`, pageUrl: path });
  }

  return issues;
}
