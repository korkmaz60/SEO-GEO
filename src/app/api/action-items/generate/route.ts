import { NextResponse } from "next/server";

import { parseJsonArrayResponse } from "@/lib/ai";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";

type ActionCategory =
  | "TECHNICAL_SEO"
  | "CONTENT"
  | "GEO"
  | "SPEED"
  | "BACKLINK"
  | "KEYWORD"
  | "STRUCTURE";

type ActionPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

type ActionDraft = {
  title: string;
  description: string;
  category: ActionCategory;
  priority: ActionPriority;
  impact: string | null;
};

type Diagnostic = {
  title: string;
  category: ActionCategory;
  priority: ActionPriority;
  finding: string;
  evidence: string[];
  how: string[];
  impact: string;
  outcome: string;
};

const validCategories: ActionCategory[] = [
  "TECHNICAL_SEO",
  "CONTENT",
  "GEO",
  "SPEED",
  "BACKLINK",
  "KEYWORD",
  "STRUCTURE",
];

const validPriorities: ActionPriority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function toFixedOrNull(value: number | null | undefined, digits = 1) {
  if (value == null) return null;
  return Number(value.toFixed(digits));
}

function composeDescription(input: {
  finding: string;
  evidence: string[];
  how: string[];
  outcome: string;
}) {
  const evidenceBlock = input.evidence.length
    ? input.evidence.map((item) => `- ${item}`).join("\n")
    : "- Dogrudan kanit saglanamadi";
  const howBlock = input.how.length
    ? input.how.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "1. Bu maddeyi ilgili sayfa veya modulde uygulayin.";

  return [
    "Sorun:",
    input.finding,
    "",
    "Kanit:",
    evidenceBlock,
    "",
    "Nasil yapilir:",
    howBlock,
    "",
    "Beklenen sonuc:",
    input.outcome,
  ].join("\n");
}

function priorityWeight(priority: ActionPriority) {
  switch (priority) {
    case "CRITICAL":
      return 0;
    case "HIGH":
      return 1;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 3;
  }
}

function buildFallbackActions(diagnostics: Diagnostic[]): ActionDraft[] {
  return diagnostics.map((diagnostic) => ({
    title: diagnostic.title,
    description: composeDescription(diagnostic),
    category: diagnostic.category,
    priority: diagnostic.priority,
    impact: diagnostic.impact,
  }));
}

function normalizeAiItems(rawItems: unknown[], diagnostics: Diagnostic[]): ActionDraft[] {
  const normalized: ActionDraft[] = [];

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object") continue;

    const item = rawItem as {
      title?: string;
      finding?: string;
      evidence?: string[] | string;
      how?: string[] | string;
      outcome?: string;
      description?: string;
      category?: string;
      priority?: string;
      impact?: string;
    };

    const category = validCategories.includes(item.category as ActionCategory)
      ? (item.category as ActionCategory)
      : "TECHNICAL_SEO";
    const priority = validPriorities.includes(item.priority as ActionPriority)
      ? (item.priority as ActionPriority)
      : "MEDIUM";

    const evidence = Array.isArray(item.evidence)
      ? item.evidence.filter(Boolean).slice(0, 4)
      : typeof item.evidence === "string" && item.evidence.trim()
        ? [item.evidence.trim()]
        : [];
    const how = Array.isArray(item.how)
      ? item.how.filter(Boolean).slice(0, 5)
      : typeof item.how === "string" && item.how.trim()
        ? [item.how.trim()]
        : [];

    const matchingDiagnostic = diagnostics.find(
      (diagnostic) => diagnostic.category === category && diagnostic.priority === priority,
    );

    const title = item.title?.trim() || matchingDiagnostic?.title;
    const finding = item.finding?.trim() || matchingDiagnostic?.finding || item.description?.trim();
    const outcome = item.outcome?.trim() || matchingDiagnostic?.outcome || "SEO ve GEO performansinda olculebilir iyilesme.";
    const impact = item.impact?.trim() || matchingDiagnostic?.impact || "Oncelikli iyilestirme";

    if (!title || !finding) continue;

    normalized.push({
      title: title.slice(0, 200),
      description: composeDescription({
        finding,
        evidence: evidence.length > 0 ? evidence : matchingDiagnostic?.evidence ?? [],
        how: how.length > 0 ? how : matchingDiagnostic?.how ?? [],
        outcome,
      }),
      category,
      priority,
      impact,
    });
  }

  const deduped = new Map<string, ActionDraft>();
  for (const item of normalized) {
    const key = item.title.trim().toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()]
    .sort((left, right) => priorityWeight(left.priority) - priorityWeight(right.priority))
    .slice(0, 12);
}

function buildDiagnostics(input: {
  domain: string;
  geoScore: number | null;
  seoScore: number | null;
  healthScore: number | null;
  speedMobile: number | null;
  speedDesktop: number | null;
  lcp: number | null;
  inp: number | null;
  cls: number | null;
  totalPages: number;
  indexedPages: number;
  thinPages: Array<{ url: string; wordCount: number | null }>;
  uncrawledPages: number;
  trackedKeywords: number;
  rankedKeywords: number;
  top10Keywords: number;
  unrankedTrackedKeywords: number;
  topKeywordSamples: string[];
  criticalIssues: number;
  warningIssues: number;
  issueCategorySamples: string[];
  referringDomains: number | null;
  domainRank: number | null;
  competitorCount: number;
  aiVisibility: number | null;
  citationCount: number;
  internalLinkCount: number;
}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  const indexRate =
    input.totalPages > 0 ? Math.round((input.indexedPages / input.totalPages) * 100) : 0;

  if ((input.healthScore ?? 100) < 75 || input.criticalIssues > 0) {
    diagnostics.push({
      title: "Teknik SEO darboğazlarini once kapat",
      category: "TECHNICAL_SEO",
      priority: input.criticalIssues > 0 ? "CRITICAL" : "HIGH",
      finding:
        "Site sagligi teknik sorunlar nedeniyle baskilaniyor; kritik hatalar ve saglik puani organik performansi asagi cekiyor.",
      evidence: [
        `Saglik skoru: ${input.healthScore ?? "olculmedi"}/100`,
        `Kritik sorun: ${input.criticalIssues}, uyari: ${input.warningIssues}`,
        input.issueCategorySamples.length > 0
          ? `En sık sorunlar: ${input.issueCategorySamples.join(", ")}`
          : "Teknik issue kategorileri kayitli degil",
      ],
      how: [
        "Son crawl sonucundaki kritik issue kategorilerini tek tek siralayip once tekrar eden sorun tiplerini ele alin.",
        "Indexlenme, canonical, title, H1, redirect ve broken link gibi organik gorunurlugu direkt etkileyen hatalari ilk sprintte kapatin.",
        "Her duzeltmeden sonra crawl'i tekrar calistirip issue sayisinin gercekten dustugunu dogrulayin.",
      ],
      impact: "SEO saglik skoru ve crawl kalitesinde yuksek etki",
      outcome: "Kritik issue sayisi duser, saglik skoru yukselir ve diger optimizasyonlar daha iyi sonuc verir.",
    });
  }

  if (input.totalPages > 0 && indexRate < 80) {
    diagnostics.push({
      title: "Index coverage acigini kapat",
      category: "TECHNICAL_SEO",
      priority: indexRate < 50 ? "CRITICAL" : "HIGH",
      finding:
        "Aktif sayfalarin anlamli bir bolumu index almiyor; bu durum landing sayfalarinizin Google'da gorunmesini sinirliyor.",
      evidence: [
        `Index coverage: ${input.indexedPages}/${input.totalPages} (%${indexRate})`,
        `Tarama verisi olmayan sayfa sayisi: ${input.uncrawledPages}`,
        `Internal link kaydi: ${input.internalLinkCount}`,
      ],
      how: [
        "Index almayan sayfalari sitemap, internal link ve robots/noindex acisindan ayri bir listeye cikarin.",
        "En onemli landing sayfalari ana navigasyon ve ilgili iceriklerden linkleyerek taranabilirligi guclendirin.",
        "Duzeltme sonrasi index kontrolu ve Search Console URL inspection ile dogrulama yapin.",
      ],
      impact: "Gorunen sayfa sayisinda dogrudan artis potansiyeli",
      outcome: "Coverage artar, daha fazla sayfa impression almaya baslar ve Page Explorer daha anlamli veri gosterir.",
    });
  }

  if (
    (input.speedMobile ?? 100) < 60 ||
    (input.lcp ?? 0) > 3 ||
    (input.inp ?? 0) > 200 ||
    (input.cls ?? 0) > 0.1
  ) {
    diagnostics.push({
      title: "Mobil hiz ve Core Web Vitals onceligini yukari cek",
      category: "SPEED",
      priority:
        (input.speedMobile ?? 100) < 40 || (input.lcp ?? 0) > 4 || (input.inp ?? 0) > 500
          ? "CRITICAL"
          : "HIGH",
      finding:
        "Mobil performans ve Core Web Vitals esikleri yeterince guclu degil; bu durum hem SEO hem kullanici deneyimini zedeliyor.",
      evidence: [
        `Mobil hiz skoru: ${input.speedMobile ?? "olculmedi"}/100`,
        `LCP: ${input.lcp != null ? `${input.lcp}s` : "olculmedi"}`,
        `INP: ${input.inp != null ? `${input.inp}ms` : "olculmedi"}, CLS: ${input.cls ?? "olculmedi"}`,
      ],
      how: [
        "En agir landing sayfalarini onceleyip hero medya, font, script ve kritik CSS maliyetini azaltin.",
        "LCP elementini belirleyip lazy olmayan, optimize ve sabit boyutlu hale getirin.",
        "Ucuncu parti scriptleri ve gereksiz client-side islem yukunu azaltip tekrar hiz testi calistirin.",
      ],
      impact: "CWV ve organik performansta yuksek etki",
      outcome: "Daha hizli sayfa acilisi, daha iyi mobil deneyim ve Core Web Vitals kartlarinda iyilesme gorulur.",
    });
  }

  if (input.thinPages.length > 0) {
    diagnostics.push({
      title: "Thin content sayfalarini yeniden calis",
      category: "CONTENT",
      priority: input.thinPages.length >= 5 ? "HIGH" : "MEDIUM",
      finding:
        "Bir grup sayfa yeterli derinlikte icerik sunmuyor; bu sayfalar hem siralama hem de AI citability tarafinda zayif kaliyor.",
      evidence: [
        `${input.thinPages.length} sayfa 300 kelimenin altinda`,
        `Ornekler: ${input.thinPages.slice(0, 3).map((page) => `${page.url} (${page.wordCount ?? 0} kelime)`).join(", ")}`,
      ],
      how: [
        "Once para getirecek veya trafik potansiyeli yuksek landing/blog sayfalarini secin.",
        "Her sayfaya net arama niyeti, soru-baslik yapisi, somut veri, ornek, liste ve ic link bloklari ekleyin.",
        "Yeniden yazilan sayfalari Search Console ve Page Explorer uzerinden impression/click artisina gore takip edin.",
      ],
      impact: "Landing kalitesi ve citability icin orta-yuksek etki",
      outcome: "Sayfalar daha derin ve alintilanabilir hale gelir, organik sorgu kapsamı genisler.",
    });
  }

  if (input.trackedKeywords === 0 || input.top10Keywords < Math.max(1, Math.round(input.trackedKeywords * 0.2))) {
    diagnostics.push({
      title: "Keyword coverage ve siralama takibini guclendir",
      category: "KEYWORD",
      priority: input.trackedKeywords === 0 ? "CRITICAL" : "HIGH",
      finding:
        "Keyword katmani ya cok ince ya da mevcut kelimeler yeterli ust sira payi alamiyor; bu da siralama firsatlarini görünmez kiliyor.",
      evidence: [
        `Takip edilen keyword: ${input.trackedKeywords}`,
        `Rank alan keyword: ${input.rankedKeywords}, Top 10: ${input.top10Keywords}`,
        input.topKeywordSamples.length > 0
          ? `Ornek keyword'ler: ${input.topKeywordSamples.join(", ")}`
          : `Top 10 disinda kalan takipli keyword: ${input.unrankedTrackedKeywords}`,
      ],
      how: [
        "Search Console ve keyword discovery akisini kullanarak para getiren sorgulari listeleyin.",
        "Keyword'leri niyet bazli cluster'lara ayirip her cluster'i bir hedef sayfaya baglayin.",
        "Top 11-20 bandindaki kelimeler icin ilgili sayfalarda title, H1, query coverage ve ic link guclendirmesi yapin.",
      ],
      impact: "Siralama gorunurlugu ve yeni trafik icin yuksek etki",
      outcome: "Takip edilen keyword seti daha anlamli hale gelir ve ust siralara cikacak firsatlar netlesir.",
    });
  }

  if ((input.referringDomains ?? 0) < 20) {
    diagnostics.push({
      title: "Referring domain tabanini buyut",
      category: "BACKLINK",
      priority: (input.referringDomains ?? 0) < 5 ? "HIGH" : "MEDIUM",
      finding:
        "Backlink otoritesi zayif gorunuyor; bu da rekabetci sorgularda domain gucunu sinirlayabilir.",
      evidence: [
        `Referring domain: ${input.referringDomains ?? 0}`,
        `Domain rank: ${input.domainRank ?? 0}`,
        `Rakip kaydi: ${input.competitorCount}`,
      ],
      how: [
        "Link alabilecek landing, rehber ve veri odakli icerikleri secip outreach listesi olusturun.",
        "Partner, referans, niş dizin ve guest content kanallarinda markali mention/link firsatlari arayin.",
        "Mevcut backlink ozeti ekranindan aylik referring domain artis hedefi belirleyin.",
      ],
      impact: "Domain otoritesi ve rekabetci keyword'ler icin orta-yuksek etki",
      outcome: "Referring domain tabani genisler ve zor sorgularda siralama alma sansi artar.",
    });
  }

  if ((input.geoScore ?? 100) < 65 || (input.aiVisibility ?? 100) < 25 || input.citationCount === 0) {
    diagnostics.push({
      title: "AI citability ve GEO sinyallerini guclendir",
      category: "GEO",
      priority: (input.geoScore ?? 100) < 50 ? "HIGH" : "MEDIUM",
      finding:
        "Icerik yapisi ve GEO sinyalleri AI motorlarinda alintilanma ihtimalini sinirliyor.",
      evidence: [
        `GEO skoru: ${input.geoScore ?? "olculmedi"}/100`,
        `AI visibility ortalamasi: ${input.aiVisibility ?? 0}%`,
        `Toplam citation: ${input.citationCount}`,
      ],
      how: [
        "Ana iceriklerde soru-baslik, dogrudan cevap, sayisal veri ve kaynak bloklarini standart hale getirin.",
        "FAQ/HowTo/Article schema gibi yapisal veri ve net bolumleme ile alintilanabilir paragraflar olusturun.",
        "GEO analizi dusuk cikan sayfalari onceleyip yeniden yazarak AI visibility kontrolu ile tekrar test edin.",
      ],
      impact: "AI Overview, ChatGPT ve benzeri motorlarda görünürlük artisi",
      outcome: "Sayfalar daha alintilanabilir olur, GEO ve AI visibility kartlari daha anlamli yukselir.",
    });
  }

  if (input.internalLinkCount < Math.max(3, input.totalPages - 1)) {
    diagnostics.push({
      title: "Ic link mimarisini duzenle",
      category: "STRUCTURE",
      priority: "MEDIUM",
      finding:
        "Ic link yapisi sayfa sayisina gore zayif gorunuyor; bu durum crawl derinligini ve authority dagitimini bozar.",
      evidence: [
        `Aktif sayfa: ${input.totalPages}`,
        `Kayitli internal link: ${input.internalLinkCount}`,
        `Indexli sayfa: ${input.indexedPages}`,
      ],
      how: [
        "Kategori, konu cluster ve para sayfalar icin merkez sayfa mantigiyla yeni ic link planı kurun.",
        "Her yeni blog veya landing icin en az bir ust seviye sayfadan ve ilgili eski icerikten baglanti ekleyin.",
        "Internal links modulu uzerinden orphan ve zayif baglanan sayfalari periyodik kontrol edin.",
      ],
      impact: "Crawl verimliligi ve authority dagilimi icin orta etki",
      outcome: "Sayfalar arasi baglanti kuvvetlenir, tarama ve siralama sinyalleri daha tutarli dagilir.",
    });
  }

  if (input.competitorCount === 0) {
    diagnostics.push({
      title: "Rakip benchmark katmanini kur",
      category: "STRUCTURE",
      priority: "LOW",
      finding:
        "Rakip verisi olmadan hangi sorgularda geride kaldiginizi ve hangi icerik formatlarinin calistigini okumak zorlasir.",
      evidence: [
        "Rakip kaydi bulunmuyor",
        `Keyword coverage: ${input.trackedKeywords} takipli keyword`,
      ],
      how: [
        "En yakin 3-5 rakibi domain bazinda ekleyin ve ana landing/icerik formatlarini inceleyin.",
        "Rakiplerin guclu keyword ve backlink alanlarina gore kendi aksiyon planini guncelleyin.",
        "Aylik olarak benchmark skorlarini kaydedip ilerleme takibi yapin.",
      ],
      impact: "Onceliklendirme kalitesinde iyilesme",
      outcome: "Hangi alanda neden geri kaldiginiz daha net gorunur ve aksiyon planiniz daha isabetli olur.",
    });
  }

  return diagnostics
    .sort((left, right) => priorityWeight(left.priority) - priorityWeight(right.priority))
    .slice(0, 10);
}

export async function POST() {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) return NextResponse.json({ error: "Proje bulunamadi" }, { status: 400 });

    const domain = ctx.project.domain;

    const [
      latestGeo,
      latestSeo,
      keywords,
      pages,
      latestCrawl,
      issues,
      competitors,
      aiVisibility,
      latestBacklink,
      internalLinkCount,
      citationCount,
    ] = await Promise.all([
      db.geoScore.findFirst({
        where: { projectId: ctx.projectId, pageId: null },
        orderBy: { measuredAt: "desc" },
      }),
      db.seoScore.findFirst({
        where: { projectId: ctx.projectId, pageId: null },
        orderBy: { measuredAt: "desc" },
      }),
      db.keyword.findMany({
        where: { projectId: ctx.projectId },
        orderBy: [{ tracked: "desc" }, { position: { sort: "asc", nulls: "last" } }],
        take: 50,
      }),
      db.page.findMany({
        where: { projectId: ctx.projectId, status: "ACTIVE" },
        select: { url: true, title: true, wordCount: true, indexed: true, lastCrawl: true },
      }),
      db.crawlSession.findFirst({
        where: { projectId: ctx.projectId, status: "COMPLETED" },
        orderBy: { startedAt: "desc" },
      }),
      db.technicalIssue.findMany({
        where: { crawl: { projectId: ctx.projectId } },
        orderBy: { createdAt: "desc" },
        take: 40,
        include: {
          page: {
            select: { url: true, title: true },
          },
        },
      }),
      db.competitor.findMany({
        where: { projectId: ctx.projectId },
        take: 5,
      }),
      db.aiVisibility.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { measuredAt: "desc" },
        distinct: ["platform"],
      }),
      db.backlinkSnapshot.findFirst({
        where: { projectId: ctx.projectId },
        orderBy: { measuredAt: "desc" },
      }),
      db.internalLink.count({
        where: { projectId: ctx.projectId },
      }),
      db.citation.count({
        where: { page: { projectId: ctx.projectId } },
      }),
    ]);

    const totalPages = pages.length;
    const indexedPages = pages.filter((page) => page.indexed).length;
    const uncrawledPages = pages.filter((page) => !page.lastCrawl).length;
    const thinPages = pages
      .filter((page) => (page.wordCount ?? 0) > 0 && (page.wordCount ?? 0) < 300)
      .sort((left, right) => (left.wordCount ?? 0) - (right.wordCount ?? 0))
      .slice(0, 5)
      .map((page) => ({ url: page.url, wordCount: page.wordCount }));

    const trackedKeywords = keywords.filter((keyword) => keyword.tracked).length;
    const rankedKeywords = keywords.filter((keyword) => keyword.position != null).length;
    const top10Keywords = keywords.filter((keyword) => keyword.position != null && keyword.position <= 10).length;
    const unrankedTrackedKeywords = keywords.filter(
      (keyword) => keyword.tracked && keyword.position == null,
    ).length;
    const topKeywordSamples = keywords
      .filter((keyword) => keyword.position != null)
      .slice(0, 5)
      .map((keyword) => `${keyword.keyword} (#${keyword.position})`);

    const criticalIssues = issues.filter((issue) => issue.severity === "CRITICAL").length;
    const warningIssues = issues.filter((issue) => issue.severity === "WARNING").length;
    const issueCategorySamples = [...new Set(issues.map((issue) => issue.category))].slice(0, 4);
    const avgAiVisibility =
      aiVisibility.length > 0
        ? Math.round(aiVisibility.reduce((sum, entry) => sum + entry.visibility, 0) / aiVisibility.length)
        : 0;

    const diagnostics = buildDiagnostics({
      domain,
      geoScore: latestGeo ? toFixedOrNull(latestGeo.overallScore, 0) : null,
      seoScore: latestSeo ? toFixedOrNull(latestSeo.overallScore, 0) : null,
      healthScore: latestSeo ? toFixedOrNull(latestSeo.healthScore, 0) : null,
      speedMobile: latestSeo ? toFixedOrNull(latestSeo.speedMobile, 0) : null,
      speedDesktop: latestSeo ? toFixedOrNull(latestSeo.speedDesktop, 0) : null,
      lcp: latestSeo?.lcpValue ?? null,
      inp: latestSeo?.fidValue ?? null,
      cls: latestSeo?.clsValue ?? null,
      totalPages,
      indexedPages,
      thinPages,
      uncrawledPages,
      trackedKeywords,
      rankedKeywords,
      top10Keywords,
      unrankedTrackedKeywords,
      topKeywordSamples,
      criticalIssues,
      warningIssues,
      issueCategorySamples,
      referringDomains: latestBacklink?.referringDomains ?? null,
      domainRank: latestBacklink?.domainRank ?? null,
      competitorCount: competitors.length,
      aiVisibility: avgAiVisibility,
      citationCount,
      internalLinkCount,
    });

    const context = `
Site: ${domain}

Skorlar:
- SEO: ${latestSeo ? Math.round(latestSeo.overallScore) : "olculmedi"}/100
- Saglik: ${latestSeo?.healthScore != null ? Math.round(latestSeo.healthScore) : "olculmedi"}/100
- Mobil hiz: ${latestSeo?.speedMobile != null ? Math.round(latestSeo.speedMobile) : "olculmedi"}/100
- Masaustu hiz: ${latestSeo?.speedDesktop != null ? Math.round(latestSeo.speedDesktop) : "olculmedi"}/100
- GEO: ${latestGeo ? Math.round(latestGeo.overallScore) : "olculmedi"}/100

Sayfalar:
- Toplam aktif sayfa: ${totalPages}
- Indexli sayfa: ${indexedPages}
- Tarama verisi olmayan sayfa: ${uncrawledPages}
- Thin content sayfa: ${thinPages.length}

Keyword'ler:
- Takip edilen keyword: ${trackedKeywords}
- Rank alan keyword: ${rankedKeywords}
- Top 10 keyword: ${top10Keywords}
- Siralanmayan takipli keyword: ${unrankedTrackedKeywords}
- Ornek keyword'ler: ${topKeywordSamples.join(", ") || "yok"}

Teknik:
- Kritik issue: ${criticalIssues}
- Warning issue: ${warningIssues}
- Crawl pages scanned: ${latestCrawl?.pagesScanned ?? 0}
- Top issue kategorileri: ${issueCategorySamples.join(", ") || "yok"}

Authority:
- Referring domains: ${latestBacklink?.referringDomains ?? 0}
- Domain rank: ${latestBacklink?.domainRank ?? 0}
- Citation count: ${citationCount}
- AI visibility ortalamasi: ${avgAiVisibility}%
- Competitor count: ${competitors.length}
- Internal link count: ${internalLinkCount}

Deterministic bulgular:
${diagnostics
  .map((diagnostic, index) => {
    const evidence = diagnostic.evidence.map((item) => `  - ${item}`).join("\n");
    return `${index + 1}. ${diagnostic.title} [${diagnostic.priority} / ${diagnostic.category}]
Sorun: ${diagnostic.finding}
Kanit:
${evidence}`;
  })
  .join("\n\n")}
`.trim();

    let generatedItems: ActionDraft[] = [];
    let provider: string = "heuristic";
    let usedFallback = false;

    const { callAi, getDefaultProvider } = await import("@/lib/ai");
    const aiProvider = getDefaultProvider();

    if (aiProvider) {
      const prompt = `Sen profesyonel bir SEO/GEO stratejisti gibi davran.

Asagidaki bulgular sadece dekoratif degil; her aksiyon maddesi bu bulgulara dayansin. Genel tavsiye verme. Her madde bir problemi, onun kanitini ve uygulanabilir duzeltme planini anlatsin.

${context}

Kurallar:
1. En az 8, en fazla 12 aksiyon maddesi uret.
2. Her madde mutlaka mevcut bulgulardan birine referans versin.
3. Soyut tavsiyeler verme; hangi alanin neden oncelikli oldugunu acikla.
4. Kanit satirlari olculen metrik, issue, URL veya sayisal veri icersin.
5. Nasil yapilir bolumu 2-5 somut adimdan olussun.
6. Kategori sadece su degerlerden biri olsun: TECHNICAL_SEO, CONTENT, GEO, SPEED, BACKLINK, KEYWORD, STRUCTURE.
7. Oncelik sadece su degerlerden biri olsun: CRITICAL, HIGH, MEDIUM, LOW.
8. Turkiye pazari ve Turkce icerik baglamina uygun yaz.
9. Sadece JSON array dondur, baska hicbir sey yazma.

JSON formati:
[
  {
    "title": "Kisa ve net aksiyon basligi",
    "finding": "Asil problem nedir?",
    "evidence": ["Kanit 1", "Kanit 2"],
    "how": ["Adim 1", "Adim 2", "Adim 3"],
    "outcome": "Bu is bittiginde beklenen sonuc",
    "category": "TECHNICAL_SEO",
    "priority": "HIGH",
    "impact": "Tahmini etki"
  }
]`;

      try {
        const result = await callAi(prompt, aiProvider);
        const parsed = parseJsonArrayResponse(result.text);
        if (parsed && parsed.length > 0) {
          generatedItems = normalizeAiItems(parsed, diagnostics);
          provider = result.provider;
        }
      } catch (error) {
        console.error("ActionItems AI generation error:", error);
      }
    }

    if (generatedItems.length === 0) {
      generatedItems = buildFallbackActions(diagnostics);
      usedFallback = true;
    }

    if (generatedItems.length === 0) {
      return NextResponse.json({ error: "Aksiyon maddesi olusturulacak yeterli veri bulunamadi" }, { status: 400 });
    }

    await db.actionItem.deleteMany({ where: { projectId: ctx.projectId } });

    const created = [];
    for (const item of generatedItems) {
      const record = await db.actionItem.create({
        data: {
          projectId: ctx.projectId,
          title: item.title,
          description: item.description,
          category: item.category,
          priority: item.priority,
          impact: item.impact,
        },
      });
      created.push(record);
    }

    return NextResponse.json({
      items: created,
      total: created.length,
      provider,
      fallback: usedFallback,
      diagnostics: diagnostics.length,
    });
  } catch (error) {
    console.error("ActionItems generate error:", error);
    return NextResponse.json({ error: "Yapilacaklar olusturulamadi" }, { status: 500 });
  }
}
