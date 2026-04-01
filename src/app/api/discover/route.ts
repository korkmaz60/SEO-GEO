import { NextResponse } from "next/server";
import { getActiveProject } from "@/lib/get-project";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const domain = ctx.project.domain;
    const baseUrl = `https://${domain}`;
    const discovered: { url: string; source: string; title?: string }[] = [];

    // ========== 1. SITEMAP.XML ==========
    const sitemapUrls = [`${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`, `${baseUrl}/sitemap-0.xml`];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SEO-GEO-Bot/1.0" } });
        if (!res.ok) continue;
        const xml = await res.text();

        // Sitemap index — alt sitemap'leri bul
        const subSitemaps = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => u.includes("sitemap"));
        if (subSitemaps.length > 0) {
          for (const subUrl of subSitemaps.slice(0, 5)) {
            try {
              const subRes = await fetch(subUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SEO-GEO-Bot/1.0" } });
              if (!subRes.ok) continue;
              const subXml = await subRes.text();
              const urls = [...subXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => !u.includes("sitemap"));
              for (const u of urls) {
                if (isSameDomain(u, domain)) {
                  discovered.push({ url: u, source: "sitemap" });
                }
              }
            } catch { /* alt sitemap hatası */ }
          }
        }

        // Doğrudan URL'ler
        const directUrls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => !u.includes("sitemap"));
        for (const u of directUrls) {
          if (isSameDomain(u, domain)) {
            discovered.push({ url: u, source: "sitemap" });
          }
        }
      } catch { /* sitemap bulunamadı */ }
    }

    // ========== 2. ROBOTS.TXT ==========
    let robotsTxt = "";
    try {
      const res = await fetch(`${baseUrl}/robots.txt`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        robotsTxt = await res.text();
        // Ek sitemap URL'leri
        const robotsSitemaps = [...robotsTxt.matchAll(/Sitemap:\s*(.*)/gi)].map(m => m[1].trim());
        for (const sm of robotsSitemaps) {
          try {
            const smRes = await fetch(sm, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SEO-GEO-Bot/1.0" } });
            if (!smRes.ok) continue;
            const smXml = await smRes.text();
            const urls = [...smXml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).filter(u => !u.includes("sitemap"));
            for (const u of urls) {
              if (isSameDomain(u, domain)) {
                discovered.push({ url: u, source: "robots.txt" });
              }
            }
          } catch { /* */ }
        }
      }
    } catch { /* robots.txt yok */ }

    // ========== 3. LLMS.TXT ==========
    let llmsTxt = "";
    try {
      const res = await fetch(`${baseUrl}/llms.txt`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        llmsTxt = await res.text();
        // URL'leri çıkar
        const llmsUrls = [...llmsTxt.matchAll(/https?:\/\/[^\s)>\]]+/g)].map(m => m[0]);
        for (const u of llmsUrls) {
          if (isSameDomain(u, domain)) {
            discovered.push({ url: u, source: "llms.txt" });
          }
        }
      }
    } catch { /* llms.txt yok */ }

    // ========== 4. ANA SAYFA INTERNAL LINK'LER ==========
    try {
      const res = await fetch(baseUrl, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "SEO-GEO-Bot/1.0" } });
      if (res.ok) {
        const html = await res.text();
        const links = [...html.matchAll(/href=["'](.*?)["']/gi)].map(m => m[1]);
        for (const href of links) {
          try {
            const resolved = new URL(href, baseUrl);
            if (isSameDomain(resolved.href, domain) && !resolved.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|ttf|pdf)$/i)) {
              discovered.push({ url: resolved.href, source: "internal-link" });
            }
          } catch { /* geçersiz URL */ }
        }
      }
    } catch { /* ana sayfa erişilemedi */ }

    // ========== DEDUPE + KAYDET ==========
    const uniqueUrls = new Map<string, { url: string; source: string }>();
    for (const d of discovered) {
      try {
        const path = new URL(d.url).pathname;
        if (!uniqueUrls.has(path)) {
          uniqueUrls.set(path, d);
        }
      } catch { /* */ }
    }

    let saved = 0;
    for (const [path, data] of uniqueUrls) {
      try {
        const sourceMap: Record<string, "SITEMAP" | "INTERNAL_LINK" | "ROBOTS_TXT" | "LLMS_TXT"> = {
          "sitemap": "SITEMAP",
          "internal-link": "INTERNAL_LINK",
          "robots.txt": "ROBOTS_TXT",
          "llms.txt": "LLMS_TXT",
        };
        await db.page.upsert({
          where: { projectId_url: { projectId: ctx.projectId, url: path } },
          update: { status: "ACTIVE", source: sourceMap[data.source] || "SITEMAP" },
          create: {
            projectId: ctx.projectId,
            url: path,
            title: path,
            status: "ACTIVE",
            source: sourceMap[data.source] || "SITEMAP",
          },
        });
        saved++;
      } catch { /* duplicate */ }
    }

    // Bildirim
    await db.alert.create({
      data: {
        projectId: ctx.projectId,
        userId: ctx.userId,
        type: "SUCCESS",
        message: `Sayfa keşfi tamamlandı: ${saved} sayfa bulundu (sitemap: ${discovered.filter(d => d.source === "sitemap").length}, internal: ${discovered.filter(d => d.source === "internal-link").length})`,
      },
    });

    return NextResponse.json({
      total: uniqueUrls.size,
      saved,
      hasRobotsTxt: !!robotsTxt,
      hasLlmsTxt: !!llmsTxt,
      hasSitemap: discovered.some(d => d.source === "sitemap"),
      sources: {
        sitemap: discovered.filter(d => d.source === "sitemap").length,
        robotsTxt: discovered.filter(d => d.source === "robots.txt").length,
        llmsTxt: discovered.filter(d => d.source === "llms.txt").length,
        internalLinks: discovered.filter(d => d.source === "internal-link").length,
      },
      pages: Array.from(uniqueUrls.entries()).slice(0, 100).map(([path, d]) => ({
        path,
        source: d.source,
      })),
    });
  } catch (error) {
    console.error("Discover error:", error);
    return NextResponse.json({ error: "Sayfa keşfi başarısız" }, { status: 500 });
  }
}

function isSameDomain(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === domain || u.hostname === `www.${domain}` || u.hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}
