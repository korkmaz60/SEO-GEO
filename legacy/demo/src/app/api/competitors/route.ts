import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ competitors: [] });
    const { projectId, project } = ctx;

    const [competitors, projectGeo, projectSeo, totalCitations] = await Promise.all([
      db.competitor.findMany({ where: { projectId }, orderBy: { seoScore: "desc" } }),
      db.geoScore.findFirst({ where: { projectId, pageId: null }, orderBy: { measuredAt: "desc" } }),
      db.seoScore.findFirst({ where: { projectId }, orderBy: { measuredAt: "desc" } }),
      db.citation.count({ where: { page: { projectId } } }),
    ]);

    const allCompetitors = [
      {
        id: "own",
        name: project.name,
        domain: project.domain,
        seoScore: Math.round(projectSeo?.overallScore ?? 0),
        geoScore: Math.round(projectGeo?.overallScore ?? 0),
        traffic: 0,
        citations: totalCitations,
        isOwn: true,
      },
      ...competitors.map((c) => ({
        id: c.id,
        name: c.name,
        domain: c.domain,
        seoScore: Math.round(c.seoScore ?? 0),
        geoScore: Math.round(c.geoScore ?? 0),
        traffic: c.traffic ?? 0,
        citations: c.citations ?? 0,
        isOwn: false,
      })),
    ];

    const totalAllCitations = allCompetitors.reduce((sum, c) => sum + c.citations, 0);

    return NextResponse.json({
      competitors: allCompetitors.map((c) => ({
        ...c,
        shareOfVoice: totalAllCitations > 0 ? Math.round((c.citations / totalAllCitations) * 100) : 0,
      })),
    });
  } catch (error) {
    console.error("Competitors API error:", error);
    return NextResponse.json({ error: "Veriler yüklenirken hata oluştu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { name, domain } = await req.json();
    if (!name || !domain) return NextResponse.json({ error: "Ad ve domain zorunlu" }, { status: 400 });

    const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

    const existing = await db.competitor.findFirst({
      where: { projectId: ctx.projectId, domain: cleanDomain },
    });
    if (existing) return NextResponse.json({ error: "Bu rakip zaten ekli" }, { status: 409 });

    // Rakibi oluştur
    const competitor = await db.competitor.create({
      data: { projectId: ctx.projectId, name, domain: cleanDomain },
    });

    // ========== OTOMATİK ANALİZ ==========
    // Arka planda rakibi analiz et — response'u bekletmeyelim
    analyzeCompetitor(ctx.projectId, competitor.id, cleanDomain, ctx.project.domain).catch(err => {
      console.error("Competitor analysis error:", err);
    });

    return NextResponse.json({ competitor, analyzing: true }, { status: 201 });
  } catch (error) {
    console.error("Competitors POST error:", error);
    return NextResponse.json({ error: "Rakip eklenemedi" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID gerekli" }, { status: 400 });

    await db.competitor.deleteMany({ where: { id, projectId: ctx.projectId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Competitors DELETE error:", error);
    return NextResponse.json({ error: "Rakip silinemedi" }, { status: 500 });
  }
}

// ============================================
// OTOMATİK RAKİP ANALİZİ
// ============================================

async function analyzeCompetitor(projectId: string, competitorId: string, competitorDomain: string, ownDomain: string) {
  let seoScore = 0;
  let geoScore = 0;
  let traffic = 0;
  let citations = 0;

  // 1. PageSpeed ile SEO tahmini
  const PAGESPEED_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  try {
    const targetUrl = `https://${competitorDomain}`;
    const [mobileRes, desktopRes] = await Promise.all([
      fetch(`${PAGESPEED_API}?url=${encodeURIComponent(targetUrl)}&strategy=mobile&category=performance`),
      fetch(`${PAGESPEED_API}?url=${encodeURIComponent(targetUrl)}&strategy=desktop&category=performance`),
    ]);

    if (mobileRes.ok && desktopRes.ok) {
      const [mobileData, desktopData] = await Promise.all([mobileRes.json(), desktopRes.json()]);
      const mobile = Math.round((mobileData.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
      const desktop = Math.round((desktopData.lighthouseResult?.categories?.performance?.score ?? 0) * 100);
      seoScore = Math.round((mobile + desktop) / 2);
    }
  } catch { /* PageSpeed hatası */ }

  // 2. Rakip sitesini crawl edip GEO değerlendir
  try {
    const res = await fetch(`https://${competitorDomain}`, {
      headers: { "User-Agent": "SEO-GEO-Crawler/1.0" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    });

    if (res.ok) {
      const html = await res.text();

      // Basit GEO skoru hesapla
      const hasSchema = html.includes("application/ld+json");
      const hasAuthor = /author|yazar/i.test(html);
      const headingCount = (html.match(/<h[2-6][^>]*>/gi) || []).length;
      const listCount = (html.match(/<[uo]l[^>]*>/gi) || []).length;
      const cleanText = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

      let geo = 20;
      if (hasSchema) geo += 15;
      if (hasAuthor) geo += 10;
      if (headingCount >= 5) geo += 15;
      else if (headingCount >= 3) geo += 10;
      if (wordCount >= 1500) geo += 15;
      else if (wordCount >= 500) geo += 10;
      if (listCount >= 2) geo += 10;
      if (html.includes("faq") || html.includes("FAQ")) geo += 5;
      geoScore = Math.min(100, geo);
    }
  } catch { /* crawl hatası */ }

  // 3. Keyword overlap — rakibin projenin keyword'lerinde sıralaması
  try {
    if (process.env.SERPAPI_KEY) {
      const { checkDomainPosition } = await import("@/lib/serper");
      const projectKeywords = await db.keyword.findMany({
        where: { projectId },
        take: 5,
        orderBy: { position: "asc" },
      });

      let foundCount = 0;
      for (const kw of projectKeywords) {
        try {
          const result = await checkDomainPosition(kw.keyword, competitorDomain);
          if (result.position && result.position <= 20) foundCount++;
        } catch { /* */ }
      }
      // Keyword overlap'e göre tahmini traffic ve citations
      traffic = foundCount * 100; // Çok kaba tahmin
      citations = foundCount;
    }
  } catch { /* Serper hatası */ }

  // 4. DataForSEO backlink — rakibin domain rank'ı
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    try {
      const { getBacklinkSummary } = await import("@/lib/dataforseo");
      const bl = await getBacklinkSummary(competitorDomain);
      // Domain rank ile SEO skorunu ayarla
      if (bl.domainRank > 0) {
        seoScore = Math.round(seoScore * 0.6 + bl.domainRank * 0.4);
      }
      traffic = Math.max(traffic, bl.referringDomains * 10);
    } catch { /* DataForSEO hatası */ }
  }

  // DB güncelle
  await db.competitor.update({
    where: { id: competitorId },
    data: { seoScore, geoScore, traffic, citations },
  });
}
