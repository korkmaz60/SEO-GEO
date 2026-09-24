import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ links: [], orphanPages: [], stats: {} });

    const [links, pages] = await Promise.all([
      db.internalLink.findMany({ where: { projectId: ctx.projectId } }),
      db.page.findMany({ where: { projectId: ctx.projectId, status: "ACTIVE" }, select: { url: true, title: true } }),
    ]);

    const pageUrls = new Set(pages.map(p => p.url));
    const linkedTo = new Set(links.map(l => l.targetUrl));
    const linkedFrom = new Set(links.map(l => l.sourceUrl));

    // Orphan pages — hiçbir sayfadan link almayan sayfalar
    const orphanPages = pages.filter(p => !linkedTo.has(p.url) && p.url !== "/");

    // En çok link alan sayfalar
    const incomingCounts: Record<string, number> = {};
    for (const link of links) {
      incomingCounts[link.targetUrl] = (incomingCounts[link.targetUrl] || 0) + 1;
    }
    const topLinked = Object.entries(incomingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url, count]) => ({ url, incomingLinks: count }));

    // En çok link veren sayfalar
    const outgoingCounts: Record<string, number> = {};
    for (const link of links) {
      outgoingCounts[link.sourceUrl] = (outgoingCounts[link.sourceUrl] || 0) + 1;
    }
    const topLinking = Object.entries(outgoingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([url, count]) => ({ url, outgoingLinks: count }));

    // Kırık iç linkler
    const brokenLinks = links.filter(l => l.statusCode && l.statusCode >= 400);

    return NextResponse.json({
      stats: {
        totalLinks: links.length,
        totalPages: pages.length,
        orphanPages: orphanPages.length,
        brokenLinks: brokenLinks.length,
        avgLinksPerPage: pages.length > 0 ? Math.round(links.length / pages.length) : 0,
      },
      orphanPages: orphanPages.map(p => ({ url: p.url, title: p.title })),
      topLinked,
      topLinking,
      brokenLinks: brokenLinks.map(l => ({
        sourceUrl: l.sourceUrl,
        targetUrl: l.targetUrl,
        statusCode: l.statusCode,
        anchorText: l.anchorText,
      })),
    });
  } catch (error) {
    console.error("Internal links API error:", error);
    return NextResponse.json({ error: "İç link verileri yüklenemedi" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const domain = ctx.project.domain;
    const baseUrl = `https://${domain}`;
    const pages = await db.page.findMany({
      where: { projectId: ctx.projectId, status: "ACTIVE" },
      select: { url: true },
      take: 100,
    });

    // Mevcut linkleri temizle
    await db.internalLink.deleteMany({ where: { projectId: ctx.projectId } });

    let totalLinks = 0;

    for (const page of pages) {
      try {
        const fullUrl = page.url.startsWith("http") ? page.url : `${baseUrl}${page.url}`;
        const res = await fetch(fullUrl, {
          headers: { "User-Agent": "SEO-GEO-LinkMapper/1.0" },
          signal: AbortSignal.timeout(10000),
          redirect: "follow",
        });

        if (!res.ok) continue;
        const html = await res.text();

        // Linkleri çıkar
        const hrefMatches = html.matchAll(/href=["'](.*?)["']/gi);
        for (const m of hrefMatches) {
          const href = m[1];
          if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;

          try {
            const resolved = new URL(href, baseUrl);
            if (resolved.hostname !== domain && resolved.hostname !== `www.${domain}`) continue;

            const targetPath = resolved.pathname || "/";
            // Asset'leri atla
            const ext = targetPath.split(".").pop()?.toLowerCase();
            if (ext && ["css", "js", "png", "jpg", "jpeg", "gif", "svg", "ico", "woff", "pdf", "zip"].includes(ext)) continue;

            // Anchor text çıkar
            const anchorMatch = html.match(new RegExp(`<a[^>]*href=["']${href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>(.*?)</a>`, "is"));
            const anchorText = anchorMatch?.[1]?.replace(/<[^>]+>/g, "").trim().slice(0, 200) || null;

            await db.internalLink.upsert({
              where: {
                projectId_sourceUrl_targetUrl: {
                  projectId: ctx.projectId,
                  sourceUrl: page.url,
                  targetUrl: targetPath,
                },
              },
              update: { anchorText },
              create: {
                projectId: ctx.projectId,
                sourceUrl: page.url,
                targetUrl: targetPath,
                anchorText,
              },
            });
            totalLinks++;
          } catch { /* invalid URL */ }
        }
      } catch { /* page fetch error */ }
    }

    return NextResponse.json({ totalLinks, pagesScanned: pages.length });
  } catch (error) {
    console.error("Internal links POST error:", error);
    return NextResponse.json({ error: "İç link taraması başarısız" }, { status: 500 });
  }
}
