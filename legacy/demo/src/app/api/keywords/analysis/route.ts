import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

export async function GET() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ distribution: {}, cannibalization: [], topMovers: [] });

    const keywords = await db.keyword.findMany({
      where: { projectId: ctx.projectId, position: { not: null } },
      orderBy: { position: "asc" },
    });

    // Pozisyon dağılımı
    const distribution = {
      top3: keywords.filter(k => k.position! <= 3).length,
      top10: keywords.filter(k => k.position! <= 10).length,
      top20: keywords.filter(k => k.position! <= 20).length,
      top50: keywords.filter(k => k.position! <= 50).length,
      top100: keywords.filter(k => k.position! <= 100).length,
      notRanking: keywords.filter(k => k.position! > 100).length,
      total: keywords.length,
    };

    // Intent dağılımı
    const intentDistribution = {
      informational: 0,
      transactional: 0,
      navigational: 0,
      commercial: 0,
    };
    for (const kw of keywords) {
      const intent = classifyIntent(kw.keyword);
      intentDistribution[intent]++;
    }

    // En çok hareket eden keyword'ler (top movers)
    const movers = keywords
      .filter(k => k.prevPosition !== null && k.position !== null)
      .map(k => ({
        keyword: k.keyword,
        position: k.position!,
        prevPosition: k.prevPosition!,
        change: k.prevPosition! - k.position!,
        volume: k.volume,
      }))
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 10);

    // Cannibalization — aynı keyword'ler (basit: aynı kelime kökü paylaşan keyword'ler ve farklı URL'de rank alanlar)
    // Gerçek cannibalization için her keyword'ün hangi sayfada rank aldığını bilmemiz lazım
    // Basit yaklaşım: keyword'leri grup gruplayıp aynı grubun birden fazla sayfada olup olmadığına bak
    const pages = await db.page.findMany({
      where: { projectId: ctx.projectId, status: "ACTIVE" },
      include: { geoScores: { take: 1, orderBy: { measuredAt: "desc" } } },
    });

    // Keyword cluster'ları (basit kelime benzerliği)
    const clusters: Record<string, string[]> = {};
    for (const kw of keywords) {
      const words = kw.keyword.toLowerCase().split(/\s+/);
      const mainWord = words.filter(w => w.length > 3)[0] || words[0];
      if (!clusters[mainWord]) clusters[mainWord] = [];
      clusters[mainWord].push(kw.keyword);
    }

    const keywordClusters = Object.entries(clusters)
      .filter(([, kws]) => kws.length >= 2)
      .map(([root, kws]) => ({ root, keywords: kws, count: kws.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ========== SEO VISIBILITY SKORU (SEMrush tarzı) ==========
    // Formül: Σ(estimatedCTR(position) × searchVolume) / Σ(searchVolume) × 100
    // Bu, keyword'lerinizin Google'daki toplam görünürlük yüzdesini verir
    const CTR_BY_POSITION: Record<number, number> = {
      1: 0.316, 2: 0.142, 3: 0.098, 4: 0.074, 5: 0.053,
      6: 0.038, 7: 0.029, 8: 0.022, 9: 0.018, 10: 0.016,
    };
    function getEstimatedCTR(position: number): number {
      if (position <= 10) return CTR_BY_POSITION[position] ?? 0.016;
      if (position <= 20) return 0.005;
      if (position <= 50) return 0.001;
      return 0;
    }

    let weightedCTR = 0;
    let totalVolume = 0;
    const kwWithVolume = keywords.filter(k => k.volume && k.volume > 0);

    for (const kw of kwWithVolume) {
      const vol = kw.volume!;
      const ctr = getEstimatedCTR(kw.position!);
      weightedCTR += ctr * vol;
      totalVolume += vol;
    }

    // Volume'suz keyword'ler için eşit ağırlık
    const kwWithoutVolume = keywords.filter(k => !k.volume || k.volume === 0);
    for (const kw of kwWithoutVolume) {
      const ctr = getEstimatedCTR(kw.position!);
      weightedCTR += ctr;
      totalVolume += 1;
    }

    const seoVisibility = totalVolume > 0
      ? Math.round((weightedCTR / totalVolume) * 100 * 100) / 100 // yüzde, 2 ondalık
      : 0;

    // Tahmini organik trafik
    const estimatedTraffic = Math.round(kwWithVolume.reduce((sum, kw) => {
      return sum + (kw.volume! * getEstimatedCTR(kw.position!));
    }, 0));

    return NextResponse.json({
      distribution,
      intentDistribution,
      topMovers: movers,
      clusters: keywordClusters,
      totalTracked: keywords.length,
      avgPosition: keywords.length > 0 ? Math.round(keywords.reduce((s, k) => s + (k.position ?? 0), 0) / keywords.length) : null,
      seoVisibility,
      estimatedTraffic,
    });
  } catch (error) {
    console.error("Keyword analysis error:", error);
    return NextResponse.json({ error: "Keyword analizi başarısız" }, { status: 500 });
  }
}

function classifyIntent(keyword: string): "informational" | "transactional" | "navigational" | "commercial" {
  const kw = keyword.toLowerCase();
  if (/\b(satın al|fiyat|ucuz|indirim|sipariş|kargo|buy|price)\b/.test(kw)) return "transactional";
  if (/\b(giriş|login|anasayfa|official|resmi|site)\b/.test(kw)) return "navigational";
  if (/\b(en iyi|karşılaştır|vs|alternatif|review|yorum|öneri|tavsiye)\b/.test(kw)) return "commercial";
  return "informational";
}
