import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { url } = await req.json();
    const targetUrl = url || `https://${ctx.project.domain}`;

    const session = await db.crawlSession.create({
      data: { projectId: ctx.projectId, status: "RUNNING" },
    });

    const startTime = Date.now();
    const res = await fetch(targetUrl, {
      headers: { "User-Agent": "SEO-GEO-Crawler/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const responseTime = Date.now() - startTime;

    const html = await res.text();
    const issues: { category: string; severity: "CRITICAL" | "WARNING" | "NOTICE" | "INFO"; message: string; details?: string }[] = [];

    // ========== HTTP STATUS ==========
    if (res.status >= 400) {
      issues.push({ category: "HTTP Hatası", severity: "CRITICAL", message: `HTTP ${res.status} hatası`, details: `Status: ${res.status} ${res.statusText}` });
    }
    if (res.redirected) {
      issues.push({ category: "Yönlendirme", severity: "NOTICE", message: `Sayfa yönlendiriliyor → ${res.url}`, details: `${targetUrl} → ${res.url}` });
    }

    // ========== RESPONSE TIME ==========
    if (responseTime > 3000) {
      issues.push({ category: "Sayfa Hızı", severity: "WARNING", message: `Yavaş yanıt süresi: ${(responseTime / 1000).toFixed(1)}s (ideal: <1s)` });
    } else if (responseTime > 5000) {
      issues.push({ category: "Sayfa Hızı", severity: "CRITICAL", message: `Çok yavaş yanıt: ${(responseTime / 1000).toFixed(1)}s` });
    }

    // ========== TITLE ==========
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.trim() || "";
    if (!title) {
      issues.push({ category: "Meta Başlık", severity: "CRITICAL", message: "Sayfa başlığı (title) bulunamadı" });
    } else if (title.length > 60) {
      issues.push({ category: "Meta Başlık", severity: "WARNING", message: `Başlık çok uzun (${title.length} karakter) — 60 karaktere düşürün` });
    } else if (title.length < 30) {
      issues.push({ category: "Meta Başlık", severity: "WARNING", message: `Başlık çok kısa (${title.length} karakter) — 30-60 arası olmalı` });
    }

    // ========== META DESCRIPTION ==========
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']/i);
    const desc = descMatch?.[1]?.trim() || "";
    if (!desc) {
      issues.push({ category: "Meta Açıklama", severity: "WARNING", message: "Meta description bulunamadı" });
    } else if (desc.length > 160) {
      issues.push({ category: "Meta Açıklama", severity: "WARNING", message: `Açıklama çok uzun (${desc.length} karakter) — 160 karaktere düşürün` });
    } else if (desc.length < 70) {
      issues.push({ category: "Meta Açıklama", severity: "NOTICE", message: `Açıklama kısa (${desc.length} karakter) — 120-160 arası ideal` });
    }

    // ========== H1 ==========
    const h1Matches = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/gi) || [];
    if (h1Matches.length === 0) {
      issues.push({ category: "H1 Etiketi", severity: "WARNING", message: "H1 etiketi bulunamadı" });
    } else if (h1Matches.length > 1) {
      issues.push({ category: "H1 Etiketi", severity: "NOTICE", message: `Birden fazla H1 etiketi var (${h1Matches.length} adet)` });
    }

    // ========== HEADING HİYERARŞİSİ ==========
    const headingTags = [...html.matchAll(/<(h[1-6])[^>]*>/gi)].map(m => parseInt(m[1][1]));
    if (headingTags.length > 1) {
      for (let i = 1; i < headingTags.length; i++) {
        if (headingTags[i] > headingTags[i - 1] + 1) {
          issues.push({
            category: "Başlık Hiyerarşisi",
            severity: "WARNING",
            message: `Başlık seviyesi atlanmış: H${headingTags[i - 1]} → H${headingTags[i]} (H${headingTags[i - 1] + 1} bekleniyor)`,
          });
          break;
        }
      }
    }

    // ========== CANONICAL ==========
    const canonicalMatch = html.match(/<link\s+rel=["']canonical["']\s+href=["']([\s\S]*?)["']/i);
    if (!canonicalMatch) {
      issues.push({ category: "Canonical", severity: "WARNING", message: "Canonical etiketi bulunamadı" });
    } else {
      const canonicalUrl = canonicalMatch[1];
      if (canonicalUrl && !canonicalUrl.includes(ctx.project.domain)) {
        issues.push({ category: "Canonical", severity: "CRITICAL", message: `Canonical farklı bir domain'e yönleniyor: ${canonicalUrl}` });
      }
    }

    // ========== ROBOTS META ==========
    const robotsMeta = html.match(/<meta\s+name=["']robots["']\s+content=["']([\s\S]*?)["']/i);
    if (robotsMeta?.[1]?.includes("noindex")) {
      issues.push({ category: "Robots", severity: "CRITICAL", message: "Sayfa noindex ile işaretlenmiş — arama motorlarında görünmez" });
    }
    if (robotsMeta?.[1]?.includes("nofollow")) {
      issues.push({ category: "Robots", severity: "WARNING", message: "Sayfa nofollow ile işaretli — linkleri takip edilmez" });
    }

    // ========== GÖRSELLER ==========
    const imgTags = html.match(/<img[^>]*>/gi) || [];
    const imgsWithoutAlt = imgTags.filter((img) => !img.includes("alt=") || /alt=["']\s*["']/.test(img));
    if (imgsWithoutAlt.length > 0) {
      issues.push({ category: "Görsel Alt Metin", severity: "WARNING", message: `${imgsWithoutAlt.length}/${imgTags.length} görselde alt metin eksik` });
    }
    // Lazy loading kontrolü
    const imgsWithoutLazy = imgTags.filter(img => !img.includes("loading="));
    if (imgTags.length > 3 && imgsWithoutLazy.length > 2) {
      issues.push({ category: "Görsel Optimizasyonu", severity: "NOTICE", message: `${imgsWithoutLazy.length} görselde lazy loading yok` });
    }

    // ========== HTTPS ==========
    if (!targetUrl.startsWith("https")) {
      issues.push({ category: "SSL/HTTPS", severity: "CRITICAL", message: "Site HTTPS kullanmıyor" });
    }

    // ========== MIXED CONTENT ==========
    const httpResources = html.match(/(?:src|href)=["']http:\/\/[^"']+["']/gi) || [];
    if (httpResources.length > 0 && targetUrl.startsWith("https")) {
      issues.push({ category: "Mixed Content", severity: "WARNING", message: `${httpResources.length} kaynak HTTP üzerinden yükleniyor (mixed content)` });
    }

    // ========== VIEWPORT ==========
    const viewport = html.match(/<meta\s+name=["']viewport["']/i);
    if (!viewport) {
      issues.push({ category: "Viewport", severity: "WARNING", message: "Viewport meta etiketi eksik — mobil uyumluluk sorunu" });
    }

    // ========== SCHEMA MARKUP ==========
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
    if (!hasSchema) {
      issues.push({ category: "Schema Markup", severity: "WARNING", message: "Yapısal veri (Schema.org) bulunamadı — AI motorları yapısal veriyi tercih eder" });
    } else {
      if (!schemaTypes.some(t => ["Article", "BlogPosting", "WebPage", "Product", "FAQPage", "HowTo", "Organization"].includes(t))) {
        issues.push({ category: "Schema Markup", severity: "NOTICE", message: `Schema türleri sınırlı (${schemaTypes.join(", ") || "bilinmiyor"}) — Article, FAQ veya HowTo eklemeyi düşünün` });
      }
    }

    // ========== OPEN GRAPH ==========
    const hasOg = html.includes('property="og:') || html.includes("property='og:");
    if (!hasOg) {
      issues.push({ category: "Open Graph", severity: "NOTICE", message: "Open Graph meta etiketleri eksik — sosyal medya paylaşımlarında kötü görünür" });
    }

    // ========== TWITTER CARD ==========
    const hasTwitterCard = html.includes('name="twitter:') || html.includes("name='twitter:");
    if (!hasTwitterCard && !hasOg) {
      issues.push({ category: "Twitter Card", severity: "INFO", message: "Twitter Card meta etiketleri eksik" });
    }

    // ========== İÇERİK KALİTESİ ==========
    const cleanText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;
    if (wordCount < 300) {
      issues.push({ category: "İçerik", severity: "WARNING", message: `Thin content — sadece ${wordCount} kelime (minimum 300 önerilir)` });
    } else if (wordCount < 100) {
      issues.push({ category: "İçerik", severity: "CRITICAL", message: `Çok az içerik — ${wordCount} kelime` });
    }

    // ========== İÇ LİNKLER ==========
    const hrefMatches = html.match(/href=["'](\/[^"']*|https?:\/\/[^"']*?)["']/gi) || [];
    const internalLinks = hrefMatches
      .map((m) => m.match(/href=["'](.*?)["']/)?.[1])
      .filter((l): l is string => !!l && (l.startsWith("/") || l.includes(ctx.project.domain)));
    const externalLinks = hrefMatches
      .map((m) => m.match(/href=["'](.*?)["']/)?.[1])
      .filter((l): l is string => !!l && l.startsWith("http") && !l.includes(ctx.project.domain));

    if (internalLinks.length < 2) {
      issues.push({ category: "İç Bağlantı", severity: "WARNING", message: `Yetersiz iç bağlantı (${internalLinks.length}) — diğer sayfalara link verin` });
    }

    // ========== BROKEN INTERNAL LINKS (hızlı kontrol - HEAD request) ==========
    const brokenLinks: string[] = [];
    const uniqueInternalLinks = [...new Set(internalLinks)].slice(0, 10); // İlk 10 linki kontrol et
    const baseUrl = `https://${ctx.project.domain}`;
    for (const link of uniqueInternalLinks) {
      try {
        const fullUrl = link.startsWith("http") ? link : `${baseUrl}${link}`;
        const linkRes = await fetch(fullUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(5000),
          redirect: "follow",
          headers: { "User-Agent": "SEO-GEO-Crawler/1.0" },
        });
        if (linkRes.status >= 400) {
          brokenLinks.push(`${link} (${linkRes.status})`);
        }
      } catch { /* timeout = skip */ }
    }
    if (brokenLinks.length > 0) {
      issues.push({
        category: "Kırık Bağlantı",
        severity: "CRITICAL",
        message: `${brokenLinks.length} kırık iç bağlantı tespit edildi`,
        details: brokenLinks.join(", "),
      });
    }

    // ========== HREFLANG ==========
    const hasHreflang = /<link[^>]+hreflang/i.test(html);

    // ========== LANG ATTRIBUTE ==========
    const htmlLang = html.match(/<html[^>]*lang=["']([^"']+)["']/i)?.[1];
    if (!htmlLang) {
      issues.push({ category: "Dil Etiketi", severity: "NOTICE", message: "HTML lang attribute eksik — arama motorları sayfa dilini belirleyemez" });
    }

    // ========== SAYFA KAYDET ==========
    await db.page.upsert({
      where: { projectId_url: { projectId: ctx.projectId, url: new URL(targetUrl).pathname || "/" } },
      update: { title, lastCrawl: new Date(), wordCount },
      create: {
        projectId: ctx.projectId,
        url: new URL(targetUrl).pathname || "/",
        title,
        wordCount,
        status: "ACTIVE",
      },
    });

    // Sorunları DB'ye kaydet
    for (const issue of issues) {
      await db.technicalIssue.create({
        data: {
          crawlId: session.id,
          category: issue.category,
          severity: issue.severity,
          message: issue.message,
          details: issue.details || null,
        },
      });
    }

    await db.crawlSession.update({
      where: { id: session.id },
      data: {
        pagesScanned: 1,
        issuesFound: issues.length,
        status: "COMPLETED",
        finishedAt: new Date(),
      },
    });

    return NextResponse.json({
      url: targetUrl,
      statusCode: res.status,
      responseTime,
      title,
      description: desc,
      wordCount,
      h1Count: h1Matches.length,
      imgCount: imgTags.length,
      internalLinkCount: internalLinks.length,
      externalLinkCount: externalLinks.length,
      brokenLinkCount: brokenLinks.length,
      hasCanonical: !!canonicalMatch,
      hasSchema,
      schemaTypes,
      hasOpenGraph: hasOg,
      hasHreflang,
      htmlLang,
      issues,
      issueCount: issues.length,
      critical: issues.filter((i) => i.severity === "CRITICAL").length,
      warnings: issues.filter((i) => i.severity === "WARNING").length,
    });
  } catch (error) {
    console.error("Crawl error:", error);
    return NextResponse.json({ error: "Sayfa taraması başarısız" }, { status: 500 });
  }
}
