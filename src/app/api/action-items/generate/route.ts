import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";
import { parseJsonArrayResponse } from "@/lib/ai";

/**
 * AI ile tüm proje verilerini analiz edip yapılacaklar listesi oluşturur.
 * Gemini/Claude/OpenAI kullanarak kişiselleştirilmiş, önceliklendirilmiş aksiyon öğeleri üretir.
 */
export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadı" }, { status: 400 });

    const domain = ctx.project.domain;

    // ========== TÜM VERİLERİ TOPLA ==========
    const [
      latestGeo, latestSeo, keywords, pages,
      latestCrawl, issues, competitors, aiVisibility,
    ] = await Promise.all([
      db.geoScore.findFirst({
        where: { projectId: ctx.projectId, pageId: null },
        orderBy: { measuredAt: "desc" },
      }),
      db.seoScore.findFirst({
        where: { projectId: ctx.projectId },
        orderBy: { measuredAt: "desc" },
      }),
      db.keyword.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { position: "asc" },
        take: 30,
      }),
      db.page.findMany({
        where: { projectId: ctx.projectId, status: "ACTIVE" },
        take: 20,
      }),
      db.crawlSession.findFirst({
        where: { projectId: ctx.projectId, status: "COMPLETED" },
        orderBy: { startedAt: "desc" },
      }),
      db.technicalIssue.findMany({
        where: { crawl: { projectId: ctx.projectId } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.competitor.findMany({
        where: { projectId: ctx.projectId },
        take: 5,
      }),
      db.aiVisibility.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { measuredAt: "desc" },
        take: 10,
      }),
    ]);

    // Veri özetini hazırla
    const dataContext = `
## Site: ${domain}

### SEO Durumu
- SEO Skoru: ${latestSeo?.overallScore ?? "Yok"}/100
- Sağlık Skoru: ${latestSeo?.healthScore ?? "Yok"}/100
- Mobil Hız: ${latestSeo?.speedMobile ?? "Yok"}/100
- Masaüstü Hız: ${latestSeo?.speedDesktop ?? "Yok"}/100
- LCP: ${latestSeo?.lcpValue ? latestSeo.lcpValue + "s" : "Ölçülmedi"} (hedef: <2.5s)
- CLS: ${latestSeo?.clsValue ?? "Ölçülmedi"} (hedef: <0.1)
- INP/TBT: ${latestSeo?.fidValue ? latestSeo.fidValue + "ms" : "Ölçülmedi"} (hedef: <200ms)

### GEO Durumu
- GEO Skoru: ${latestGeo?.overallScore ?? "Yok"}/100
- Otorite: ${latestGeo?.authorityScore ?? "Yok"}/100
- Okunabilirlik: ${latestGeo?.readabilityScore ?? "Yok"}/100
- Yapı: ${latestGeo?.structureScore ?? "Yok"}/100
- Teknik: ${latestGeo?.technicalScore ?? "Yok"}/100

### Teknik Sorunlar (${issues.length} adet)
${issues.map((i) => `- [${i.severity}] ${i.category}: ${i.message}`).join("\n")}

### Sayfalar (${pages.length} adet)
${pages.map((p) => `- ${p.url} — ${p.title || "Başlıksız"} (${p.wordCount ?? 0} kelime, indexed: ${p.indexed})`).join("\n")}

### Anahtar Kelimeler (${keywords.length} adet)
${keywords.map((k) => `- "${k.keyword}" → pozisyon: ${k.position ?? "sıralanmıyor"}, hacim: ${k.volume ?? "bilinmiyor"}, trend: ${k.trend}`).join("\n")}

### Rakipler
${competitors.length > 0 ? competitors.map((c) => `- ${c.name} (${c.domain}) — SEO: ${c.seoScore ?? "?"}, GEO: ${c.geoScore ?? "?"}`).join("\n") : "Rakip eklenmemiş"}

### AI Görünürlük
${aiVisibility.length > 0 ? aiVisibility.map((a) => `- ${a.platform}: ${a.visibility}% görünürlük, ${a.citations} atıf`).join("\n") : "AI visibility verisi yok"}

### Crawl
- Taranan sayfa: ${latestCrawl?.pagesScanned ?? 0}
- Bulunan sorun: ${latestCrawl?.issuesFound ?? 0}
`.trim();

    // ========== AI İLE ANALİZ ==========
    const { callAi, getDefaultProvider } = await import("@/lib/ai");
    const provider = getDefaultProvider();

    if (!provider) {
      return NextResponse.json({ error: "AI sağlayıcı yapılandırılmamış" }, { status: 400 });
    }

    const prompt = `Sen bir SEO ve GEO (Generative Engine Optimization) uzmanısın. Aşağıdaki site verilerini analiz edip, sitenin SEO ve GEO performansını artırmak için yapılacaklar listesi oluştur.

${dataContext}

## Kurallar:
1. Her madde somut ve uygulanabilir olmalı (ne yapılacak, nereye yapılacak)
2. Her madde için "nasıl yapılır" açıklaması yaz (3-5 cümle, teknik detay ver)
3. Her madde için tahmini etki belirt (örn: "SEO +5 puan", "LCP %40 iyileşme")
4. Öncelik: CRITICAL (acil, skor düşüren), HIGH (önemli etki), MEDIUM (iyi gelişim), LOW (bonus)
5. Kategori: TECHNICAL_SEO, CONTENT, GEO, SPEED, BACKLINK, KEYWORD, STRUCTURE
6. En az 10, en fazla 20 madde üret
7. Mevcut sorunlara özel ol, genel tavsiyeler verme
8. Türkçe yaz

JSON formatında yanıt ver (sadece JSON, başka bir şey yazma):
[
  {
    "title": "Kısa başlık (max 80 karakter)",
    "description": "Nasıl yapılacağı hakkında detaylı açıklama. Adım adım ne yapılmalı, hangi araçlar kullanılmalı, neye dikkat edilmeli.",
    "category": "TECHNICAL_SEO|CONTENT|GEO|SPEED|BACKLINK|KEYWORD|STRUCTURE",
    "priority": "CRITICAL|HIGH|MEDIUM|LOW",
    "impact": "Tahmini etki açıklaması"
  }
]`;

    const result = await callAi(prompt, provider);
    let items: Array<{
      title: string;
      description: string;
      category: string;
      priority: string;
      impact: string;
    }> = [];

    const parsed = parseJsonArrayResponse(result.text);
    if (!parsed || parsed.length === 0) {
      console.error("AI JSON parse failed. Response:", result.text.substring(0, 500));
      return NextResponse.json({ error: "AI yanıtı parse edilemedi. Lütfen tekrar deneyin." }, { status: 500 });
    }
    items = parsed as typeof items;

    // ========== VERİTABANINA KAYDET ==========
    // Önce mevcut olanları sil
    await db.actionItem.deleteMany({ where: { projectId: ctx.projectId } });

    const validCategories = ["TECHNICAL_SEO", "CONTENT", "GEO", "SPEED", "BACKLINK", "KEYWORD", "STRUCTURE"];
    const validPriorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

    const created = [];
    for (const item of items) {
      const category = validCategories.includes(item.category) ? item.category : "TECHNICAL_SEO";
      const priority = validPriorities.includes(item.priority) ? item.priority : "MEDIUM";

      const record = await db.actionItem.create({
        data: {
          projectId: ctx.projectId,
          title: item.title.slice(0, 200),
          description: item.description,
          category: category as "TECHNICAL_SEO" | "CONTENT" | "GEO" | "SPEED" | "BACKLINK" | "KEYWORD" | "STRUCTURE",
          priority: priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
          impact: item.impact || null,
        },
      });
      created.push(record);
    }

    return NextResponse.json({
      items: created,
      total: created.length,
      provider: result.provider,
    });
  } catch (error) {
    console.error("ActionItems generate error:", error);
    return NextResponse.json({ error: "Yapılacaklar oluşturulamadı" }, { status: 500 });
  }
}
