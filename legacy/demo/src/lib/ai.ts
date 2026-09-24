import "server-only";

export type AiProvider = "claude" | "gemini" | "openai";

interface AiResponse {
  text: string;
  provider: AiProvider;
}

// ============================================
// PROVIDER ROUTING
// ============================================

export async function callAi(prompt: string, provider: AiProvider, model?: string): Promise<AiResponse> {
  switch (provider) {
    case "claude": return callClaude(prompt, model);
    case "gemini": return callGemini(prompt, model);
    case "openai": return callOpenAI(prompt, model);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

function getAvailableProviders(): { id: AiProvider; name: string; configured: boolean }[] {
  return [
    { id: "claude", name: "Claude", configured: !!process.env.ANTHROPIC_API_KEY },
    { id: "gemini", name: "Gemini", configured: !!process.env.GEMINI_API_KEY },
    { id: "openai", name: "GPT-4", configured: !!process.env.OPENAI_API_KEY },
  ];
}

export function getDefaultProvider(): AiProvider | null {
  const providers = getAvailableProviders();
  const configured = providers.find((p) => p.configured);
  return configured?.id ?? null;
}

export function getProviderList() {
  return getAvailableProviders();
}

// ============================================
// CLAUDE (Anthropic)
// ============================================

async function callClaude(prompt: string, model?: string): Promise<AiResponse> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const response = await client.messages.create({
    model: model || "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  if (!response.content || response.content.length === 0) {
    return { text: "", provider: "claude" };
  }
  const textBlock = response.content.find(c => c.type === "text");
  return { text: textBlock && textBlock.type === "text" ? textBlock.text : "", provider: "claude" };
}

// ============================================
// GEMINI (Google)
// ============================================

async function callGemini(prompt: string, modelId?: string): Promise<AiResponse> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: modelId || "gemini-2.0-flash" });

  const result = await model.generateContent(prompt);
  return { text: result.response.text(), provider: "gemini" };
}

// ============================================
// OPENAI (GPT-4)
// ============================================

async function callOpenAI(prompt: string, model?: string): Promise<AiResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(60000), // 60s timeout
  });

  const data = await res.json();
  return { text: data.choices?.[0]?.message?.content ?? "", provider: "openai" };
}

// ============================================
// JSON PARSER
// ============================================

function parseJsonResponse(text: string) {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  // 1. Önce direkt parse dene
  try {
    return JSON.parse(cleaned);
  } catch { /* devam */ }

  // 2. İlk { ile eşleşen kapanış } bul (balanced braces)
  const objStart = cleaned.indexOf("{");
  if (objStart >= 0) {
    let depth = 0;
    for (let i = objStart; i < cleaned.length; i++) {
      if (cleaned[i] === "{") depth++;
      else if (cleaned[i] === "}") depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(objStart, i + 1));
        } catch { break; }
      }
    }
  }

  // 3. İlk [ ile eşleşen kapanış ] bul (array response)
  const arrStart = cleaned.indexOf("[");
  if (arrStart >= 0) {
    let depth = 0;
    for (let i = arrStart; i < cleaned.length; i++) {
      if (cleaned[i] === "[") depth++;
      else if (cleaned[i] === "]") depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(arrStart, i + 1));
        } catch { break; }
      }
    }
  }

  return null;
}

/** Array JSON parse — action items gibi array döndüren AI yanıtları için */
function parseJsonArrayResponse(text: string): unknown[] | null {
  const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();

  // 1. Direkt parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* devam */ }

  // 2. Balanced brackets bul
  const arrStart = cleaned.indexOf("[");
  if (arrStart >= 0) {
    let depth = 0;
    for (let i = arrStart; i < cleaned.length; i++) {
      if (cleaned[i] === "[") depth++;
      else if (cleaned[i] === "]") depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(cleaned.slice(arrStart, i + 1));
          if (Array.isArray(parsed)) return parsed;
        } catch { break; }
      }
    }
  }

  return null;
}

// ============================================
// GEO SAYFA ANALİZİ — PROFESYONEL PROMPT
// ============================================

const GEO_PAGE_PROMPT = (url: string, domain: string, title: string, h1: string, hasSchema: boolean, schemaTypes: string[], text: string, wordCount: number, headingStructure: string, hasFaq: boolean, hasHowTo: boolean, hasAuthor: boolean, hasSources: boolean, hasStats: boolean, listCount: number, tableCount: number) => `
Sen bir GEO (Generative Engine Optimization) kıdemli uzmanısın. Aşağıdaki web sayfasını, AI arama motorlarının (ChatGPT, Google AI Overviews, Perplexity, Claude) bu sayfayı yanıtlarında kaynak olarak alıntılama olasılığı açısından detaylı analiz et.

## SAYFA BİLGİLERİ
- URL: ${url}
- Domain: ${domain}
- Title: ${title || "YOK"}
- H1: ${h1 || "YOK"}
- Kelime sayısı: ${wordCount}
- Schema Markup: ${hasSchema ? `Var (${schemaTypes.join(", ")})` : "Yok"}
- FAQ Schema: ${hasFaq ? "Var" : "Yok"}
- HowTo Schema: ${hasHowTo ? "Var" : "Yok"}
- Yazar bilgisi: ${hasAuthor ? "Var" : "Yok"}
- Kaynak/referans: ${hasSources ? "Var" : "Yok"}
- İstatistik/sayısal veri: ${hasStats ? "Var" : "Yok"}
- Liste sayısı: ${listCount}
- Tablo sayısı: ${tableCount}
- Başlık yapısı: ${headingStructure}

## İÇERİK (ilk 8000 karakter)
${text.slice(0, 8000)}

## DEĞERLENDİRME KRİTERLERİ

### Authority (Otorite) — Ağırlık %30
- E-E-A-T sinyalleri: Yazar adı, uzmanlık bilgisi, kurum/şirket referansı
- Kaynak ve referanslar: Akademik atıflar, resmi istatistikler, uzman görüşleri
- Sayısal veri zenginliği: Spesifik rakamlar, yüzdeler, tarihler
- İçerik güncelliği: Tarih bilgisi, "güncellendi" ifadeleri
- Domain otoritesi sinyalleri: Hakkımızda, iletişim, yasal sayfaları referansları

### Readability (Okunabilirlik) — Ağırlık %25
- Cümle uzunluğu ortalaması (ideal: 15-20 kelime)
- Paragraf yapısı (ideal: 3-5 cümle per paragraf)
- Doğrudan yanıt formatı: İlk paragrafta konunun özeti var mı?
- Aktif/pasif cümle oranı
- Türkçe dil kalitesi ve akıcılık
- Jargon/teknik terim yoğunluğu (okuyucu seviyesine uygunluk)

### Structure (Yapı) — Ağırlık %25
- Başlık hiyerarşisi: H1 > H2 > H3 mantıklı sıralama
- Soru-cevap formatı: Başlıklar soru formatında mı? (AI motorları soru-cevap sever)
- Listeler ve tablolar: Bilgiyi organize eden yapılar
- Featured Snippet uygunluğu: Tanım paragrafları, numaralı adımlar
- İçerik bölümleme kalitesi: Her bölüm tek bir konuya odaklı mı?
- Schema markup zenginliği: Article, FAQ, HowTo, BreadcrumbList

### Technical (Teknik) — Ağırlık %20
- Schema markup varlığı ve çeşitliliği
- Canonical URL doğruluğu
- Meta etiketleri kalitesi (title, description)
- Clean HTML yapısı (semantic etiketler)
- llms.txt uyumluluğu
- Bağlantı kalitesi: İç ve dış linkler

## ÇIKTI FORMATI
SADECE JSON döndür — açıklama, markdown, kod bloğu ekleme:
{
  "scores": {
    "authority": <0-100 tam sayı>,
    "readability": <0-100 tam sayı>,
    "structure": <0-100 tam sayı>,
    "technical": <0-100 tam sayı>,
    "overall": <authority*0.3 + readability*0.25 + structure*0.25 + technical*0.2 hesapla>
  },
  "suggestions": [
    {"type": "critical", "text": "Türkçe — en önemli 1-2 eksiklik"},
    {"type": "warning", "text": "Türkçe — iyileştirme önerileri (3-5 adet)"},
    {"type": "success", "text": "Türkçe — iyi yapılan şeyler (1-3 adet)"}
  ],
  "eeat": {
    "experience": <0-100>,
    "expertise": <0-100>,
    "authoritativeness": <0-100>,
    "trustworthiness": <0-100>
  },
  "citability": {
    "directAnswerReady": <true/false — İlk paragraf AI tarafından doğrudan kullanılabilir mi?>,
    "factDensity": <0-100 — Alıntılanabilir bilgi yoğunluğu>,
    "uniqueInsights": <0-100 — Benzersiz bilgi/perspektif var mı?>
  },
  "summary": "2-3 cümle Türkçe. Sayfanın AI motorlarındaki atıflanma potansiyelinin dürüst değerlendirmesi."
}`;

// ============================================
// İÇERİK ANALİZİ — PROFESYONEL PROMPT
// ============================================

const CONTENT_PROMPT = (content: string, wordCount: number, headingCount: number, listCount: number, linkCount: number, numberCount: number) => `
Sen bir GEO (Generative Engine Optimization) ve içerik stratejisi kıdemli uzmanısın. Aşağıdaki içeriği AI arama motorlarında atıflanabilirlik açısından analiz et.

## İÇERİK METRİKLERİ
- Kelime sayısı: ${wordCount}
- Başlık sayısı: ${headingCount}
- Liste sayısı: ${listCount}
- Bağlantı sayısı: ${linkCount}
- Sayısal veri sayısı: ${numberCount}

## İÇERİK
${content.slice(0, 10000)}

## DEĞERLENDİRME KRİTERLERİ

### Authority (Otorite) — %30
Puan ver: 0-20 (veri yok, kaynak yok), 20-40 (az kaynak/veri), 40-60 (orta), 60-80 (iyi referanslar), 80-100 (akademik düzey)
- Spesifik sayısal veriler (tarih, yüzde, istatistik) — genel ifadeler değil, somut rakamlar
- Kaynak referansları ("X araştırmasına göre", "Y üniversitesi", "Z raporuna göre")
- Uzman görüşleri ve deneyim aktarımı
- Güncellik sinyalleri

### Readability (Okunabilirlik) — %25
Puan ver: ideal cümle uzunluğu 15-20 kelime, paragraf 3-5 cümle
- Doğrudan yanıt: İlk 2 cümlede konunun özeti var mı? (AI motorları ilk paragrafı alıntılar)
- Bilgiyi sindirilebilir parçalara bölme
- Teknik terimleri açıklama

### Structure (Yapı) — %25
- Soru formatında alt başlıklar (H2/H3) — AI "X nedir?" sorusuna H2 başlığıyla eşleştirir
- Numaralı listeler, tanım listeleri
- Tablolar
- Her bölüm bağımsız anlam taşıyor mu? (AI tek bölümü alıntılayabilir)

### Technical (Teknik) — %20
- İç ve dış bağlantı kalitesi
- Başlık hiyerarşisi (H1>H2>H3 sırası)
- İçerik uzunluğu (1500+ kelime kapsamlı konular için)

## ÇIKTI FORMATI
SADECE JSON döndür:
{
  "scores": {
    "authority": <0-100>,
    "readability": <0-100>,
    "structure": <0-100>,
    "technical": <0-100>,
    "overall": <ağırlıklı ortalama>
  },
  "metrics": {
    "wordCount": ${wordCount},
    "sentenceCount": <say>,
    "avgWordsPerSentence": <hesapla>,
    "headingCount": ${headingCount},
    "listCount": ${listCount},
    "linkCount": ${linkCount},
    "numberCount": ${numberCount}
  },
  "suggestions": [
    {"type": "critical", "text": "Türkçe — en acil eksiklik"},
    {"type": "warning", "text": "Türkçe — iyileştirme önerisi"},
    {"type": "success", "text": "Türkçe — güçlü yönler"}
  ],
  "rewriteSuggestion": "İlk paragrafın AI-uyumlu yeniden yazımı — doğrudan yanıt formatında, alıntılanabilir",
  "summary": "2-3 cümle Türkçe genel değerlendirme — dürüst ve aksiyon odaklı"
}`;

// ============================================
// AI VİSİBİLİTY CHECK — DOĞAL SORGU
// ============================================

const VISIBILITY_CHECK_PROMPT = (query: string) => `
${query}

Yanıtında ilgili web sitelerinden ve kaynaklardan bilgi ver. Kaynak web sitelerinin URL'lerini veya domain adlarını açıkça belirt.`;

export async function checkAiVisibility(query: string, domain: string, provider?: AiProvider) {
  const { extractDomainBase } = await import("@/lib/utils");
  const activeProvider = provider ?? getDefaultProvider();
  if (!activeProvider) return null;

  const response = await callAi(VISIBILITY_CHECK_PROMPT(query), activeProvider);
  const text = response.text.toLowerCase();
  const domainLower = domain.toLowerCase().replace(/^www\./, "");
  const domainBase = extractDomainBase(domain);

  // Domain mention tespiti — exact domain, www, veya marka adı
  const mentioned = text.includes(domainLower)
    || text.includes(`www.${domainLower}`)
    || (domainBase.length > 3 && text.includes(domainBase));

  // Hangi pozisyonda mention edildiğini bul
  const position = findMentionPosition(text, domainLower, domainBase);

  // Snippet çıkar
  let snippet: string | null = null;
  if (mentioned) {
    const sentences = response.text.split(/[.!?\n]+/);
    const mentionSentence = sentences.find(s => {
      const lower = s.toLowerCase();
      return lower.includes(domainLower) || (domainBase.length > 3 && lower.includes(domainBase));
    });
    snippet = mentionSentence?.trim().slice(0, 300) || null;
  }

  return {
    query,
    mentioned,
    position,
    snippet,
    responseLength: response.text.length,
    provider: response.provider,
  };
}

function findMentionPosition(text: string, domain: string, domainBase: string): number | null {
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)/g;
  const foundDomains: string[] = [];
  let match;
  while ((match = urlPattern.exec(text)) !== null) {
    const found = match[1].toLowerCase().replace(/^www\./, "");
    if (!foundDomains.includes(found)) {
      foundDomains.push(found);
    }
  }

  // Exact match — includes() değil, hostname eşleştirme
  const idx = foundDomains.findIndex(d => d === domain || d.endsWith(`.${domain}`) || d === domainBase || d.includes(domainBase));
  return idx >= 0 ? idx + 1 : null;
}

// ============================================
// BATCH AI VISIBILITY — Birden fazla sorgu
// ============================================

export async function batchCheckAiVisibility(
  queries: string[],
  domain: string,
  platforms: AiProvider[]
): Promise<{
  results: Array<{
    query: string;
    platform: AiProvider;
    mentioned: boolean;
    position: number | null;
    snippet: string | null;
  }>;
  summary: {
    totalChecks: number;
    totalMentions: number;
    mentionRate: number;
    avgPosition: number | null;
  };
}> {
  const results: Array<{
    query: string;
    platform: AiProvider;
    mentioned: boolean;
    position: number | null;
    snippet: string | null;
  }> = [];

  for (const query of queries) {
    for (const platform of platforms) {
      try {
        const result = await checkAiVisibility(query, domain, platform);
        if (result) {
          results.push({
            query,
            platform,
            mentioned: result.mentioned,
            position: result.position,
            snippet: result.snippet,
          });
        }
      } catch {
        results.push({ query, platform, mentioned: false, position: null, snippet: null });
      }
    }
  }

  const mentions = results.filter(r => r.mentioned);
  const positions = mentions.map(r => r.position).filter((p): p is number => p !== null);

  return {
    results,
    summary: {
      totalChecks: results.length,
      totalMentions: mentions.length,
      mentionRate: results.length > 0 ? Math.round((mentions.length / results.length) * 100) : 0,
      avgPosition: positions.length > 0 ? Math.round(positions.reduce((a, b) => a + b, 0) / positions.length) : null,
    },
  };
}

// ============================================
// GEO ANALİZ FONKSİYONLARI
// ============================================

function extractPageMetadata(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || "";
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || "";
  const hasSchema = html.includes("application/ld+json");

  // Schema türlerini çıkar
  const schemaTypes: string[] = [];
  const schemaMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of schemaMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const type = parsed["@type"];
      if (Array.isArray(type)) schemaTypes.push(...type);
      else if (type) schemaTypes.push(type);
    } catch { /* invalid json-ld */ }
  }

  // FAQ, HowTo schema tespiti
  const hasFaq = schemaTypes.some(t => t.toLowerCase().includes("faq")) || html.includes('"FAQPage"');
  const hasHowTo = schemaTypes.some(t => t.toLowerCase().includes("howto")) || html.includes('"HowTo"');

  // Heading yapısı
  const headings: string[] = [];
  const headingMatches = html.matchAll(/<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const m of headingMatches) {
    const tag = m[1].toUpperCase();
    const text = m[2].replace(/<[^>]+>/g, "").trim();
    if (text) headings.push(`${tag}: ${text.slice(0, 60)}`);
  }
  const headingStructure = headings.slice(0, 15).join(" → ") || "Başlık yapısı yok";

  // E-E-A-T sinyalleri
  const hasAuthor = /author|yazar|yazan|written\s+by/i.test(html) ||
    html.includes('"author"') || html.includes('"Person"');
  const hasSources = /kaynak|referans|kaynakça|source|reference|araştırma|çalışma|rapor|istatistik/i.test(text);
  const hasStats = (text.match(/\d+[%.,]\d*|\b\d{4}\b|\b\d+\s*(milyon|milyar|bin|kişi|adet|yıl)/g) || []).length >= 3;

  // Liste ve tablo sayısı
  const listCount = (html.match(/<[uo]l[^>]*>/gi) || []).length;
  const tableCount = (html.match(/<table[^>]*>/gi) || []).length;

  const wordCount = text.split(/\s+/).filter(Boolean).length;

  return {
    text, title, h1, hasSchema, schemaTypes, hasFaq, hasHowTo,
    hasAuthor, hasSources, hasStats, headingStructure, headings,
    listCount, tableCount, wordCount,
  };
}

export async function analyzePageGeo(html: string, url: string, domain: string, provider?: AiProvider, model?: string) {
  const activeProvider = provider ?? getDefaultProvider();
  if (!activeProvider) return null;

  const meta = extractPageMetadata(html);

  const prompt = GEO_PAGE_PROMPT(
    url, domain, meta.title, meta.h1, meta.hasSchema, meta.schemaTypes,
    meta.text, meta.wordCount, meta.headingStructure,
    meta.hasFaq, meta.hasHowTo, meta.hasAuthor, meta.hasSources, meta.hasStats,
    meta.listCount, meta.tableCount
  );

  const response = await callAi(prompt, activeProvider, model);
  const result = parseJsonResponse(response.text);
  return result ? { ...result, provider: response.provider, metadata: meta } : null;
}

export async function analyzeContentWithAi(content: string, provider?: AiProvider, model?: string) {
  const activeProvider = provider ?? getDefaultProvider();
  if (!activeProvider) return null;

  // İçerik metriklerini hesapla
  const words = content.trim().split(/\s+/);
  const wordCount = words.length;
  const headingCount = (content.match(/^#{1,6}\s.+/gm) || []).length;
  const listCount = (content.match(/^[-*]\s|^\d+\.\s/gm) || []).length;
  const linkCount = (content.match(/https?:\/\/|www\./g) || []).length;
  const numberCount = (content.match(/\d+[%.,]?\d*/g) || []).length;

  const prompt = CONTENT_PROMPT(content, wordCount, headingCount, listCount, linkCount, numberCount);
  const response = await callAi(prompt, activeProvider, model);
  const result = parseJsonResponse(response.text);
  return result ? { ...result, provider: response.provider } : null;
}

// ============================================
// EXPORT: Metadata extractor (crawl'da kullanılır)
// ============================================
export { extractPageMetadata, parseJsonArrayResponse };
