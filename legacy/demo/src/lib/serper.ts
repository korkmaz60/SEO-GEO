import "server-only";

const SERPAPI_URL = "https://serpapi.com/search.json";

function getApiKey(): string {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new Error("SERPAPI_KEY not configured");
  return key;
}

export async function searchGoogle(query: string, options?: { gl?: string; hl?: string; num?: number }) {
  const params = new URLSearchParams({
    q: query,
    api_key: getApiKey(),
    engine: "google",
    gl: options?.gl ?? "tr",
    hl: options?.hl ?? "tr",
    num: String(options?.num ?? 100),
  });

  const res = await fetch(`${SERPAPI_URL}?${params}`);
  if (!res.ok) throw new Error(`SerpApi error: ${res.status}`);
  return res.json();
}

export async function checkDomainPosition(keyword: string, domain: string) {
  const data = await searchGoogle(keyword, { num: 100 });
  const organic = data.organic_results || [];

  const idx = organic.findIndex((item: { link?: string }) => item.link?.includes(domain));
  const found = idx >= 0 ? organic[idx] : null;

  return {
    keyword,
    position: idx >= 0 ? idx + 1 : null,
    url: found?.link ?? null,
    title: found?.title ?? null,
    snippet: found?.snippet ?? null,
    totalResults: data.search_information?.total_results ?? null,
    topResults: organic.slice(0, 10).map((item: { title?: string; link?: string; position?: number }) => ({
      title: item.title,
      link: item.link,
      position: item.position,
    })),
  };
}

export async function bulkCheckPositions(keywords: string[], domain: string) {
  const results = [];
  for (const keyword of keywords) {
    try {
      const result = await checkDomainPosition(keyword, domain);
      results.push(result);
    } catch {
      results.push({ keyword, position: null, error: "Sorgu başarısız" });
    }
  }
  return results;
}

export async function checkIndexedPages(domain: string) {
  const data = await searchGoogle(`site:${domain}`, { num: 100 });
  const organic = data.organic_results || [];

  return {
    totalResults: data.search_information?.total_results ?? 0,
    pages: organic.map((item: { link?: string; title?: string; snippet?: string }) => ({
      url: item.link,
      title: item.title,
      snippet: item.snippet,
    })),
  };
}

// ============================================
// GOOGLE AI OVERVIEW — GERÇEK AI VISIBILITY
// ============================================

/**
 * SerpAPI'dan Google AI Overview (SGE) verisini çeker.
 * Google arama sonuçlarındaki AI-generated yanıtı döner.
 *
 * SerpAPI response'unda `ai_overview` alanı varsa:
 * - ai_overview.text_blocks: AI'ın ürettiği metin blokları
 * - ai_overview.references: AI'ın atıf yaptığı kaynaklar (URL + title)
 */
export interface AiOverviewResult {
  query: string;
  hasAiOverview: boolean;
  mentioned: boolean;
  mentionPosition: number | null;
  snippet: string | null;
  totalReferences: number;
  references: Array<{
    title: string;
    url: string;
    domain: string;
    position: number;
  }>;
  overviewText: string | null;
}

export async function checkGoogleAiOverview(query: string, domain: string): Promise<AiOverviewResult> {
  const data = await searchGoogle(query, { num: 10 });

  // SerpAPI ai_overview field'ı
  const aiOverview = data.ai_overview;
  const hasAiOverview = !!aiOverview;

  if (!hasAiOverview) {
    return {
      query,
      hasAiOverview: false,
      mentioned: false,
      mentionPosition: null,
      snippet: null,
      totalReferences: 0,
      references: [],
      overviewText: null,
    };
  }

  // AI Overview referanslarını çıkar
  // SerpAPI formatı: ai_overview.references veya ai_overview.text_blocks içindeki linkler
  const references: AiOverviewResult["references"] = [];

  // Method 1: Doğrudan references array'i
  if (aiOverview.references && Array.isArray(aiOverview.references)) {
    for (let i = 0; i < aiOverview.references.length; i++) {
      const ref = aiOverview.references[i];
      const refDomain = extractDomain(ref.link || ref.url || "");
      references.push({
        title: ref.title || "",
        url: ref.link || ref.url || "",
        domain: refDomain,
        position: i + 1,
      });
    }
  }

  // Method 2: text_blocks içindeki source linkler
  if (aiOverview.text_blocks && Array.isArray(aiOverview.text_blocks)) {
    for (const block of aiOverview.text_blocks) {
      if (block.sources && Array.isArray(block.sources)) {
        for (const source of block.sources) {
          const refDomain = extractDomain(source.link || source.url || "");
          if (!references.find(r => r.url === (source.link || source.url))) {
            references.push({
              title: source.title || "",
              url: source.link || source.url || "",
              domain: refDomain,
              position: references.length + 1,
            });
          }
        }
      }
    }
  }

  // Method 3: ai_overview içindeki organik stilde sonuçlar
  if (aiOverview.organic_results && Array.isArray(aiOverview.organic_results)) {
    for (let i = 0; i < aiOverview.organic_results.length; i++) {
      const item = aiOverview.organic_results[i];
      const refDomain = extractDomain(item.link || "");
      if (!references.find(r => r.url === item.link)) {
        references.push({
          title: item.title || "",
          url: item.link || "",
          domain: refDomain,
          position: references.length + 1,
        });
      }
    }
  }

  // Domain mention kontrolü — exact hostname match
  const { domainMatches } = await import("@/lib/utils");
  const mentionIdx = references.findIndex(r =>
    domainMatches(r.url, domain) || domainMatches(r.domain, domain)
  );
  const mentioned = mentionIdx >= 0;

  // Overview metnini çıkar
  let overviewText = "";
  if (aiOverview.text_blocks && Array.isArray(aiOverview.text_blocks)) {
    overviewText = aiOverview.text_blocks
      .map((b: { text?: string; snippet?: string }) => b.text || b.snippet || "")
      .join(" ")
      .slice(0, 500);
  } else if (aiOverview.snippet) {
    overviewText = aiOverview.snippet.slice(0, 500);
  }

  // Mention edilen snippet'ı bul
  let snippet: string | null = null;
  if (mentioned && references[mentionIdx]) {
    snippet = `[${references[mentionIdx].position}. sırada] ${references[mentionIdx].title}`;
  }

  return {
    query,
    hasAiOverview: true,
    mentioned,
    mentionPosition: mentioned ? references[mentionIdx].position : null,
    snippet,
    totalReferences: references.length,
    references,
    overviewText: overviewText || null,
  };
}

// ============================================
// SERP FEATURES — Featured Snippet, PAA, etc.
// ============================================

export interface SerpFeatures {
  hasAiOverview: boolean;
  hasFeaturedSnippet: boolean;
  featuredSnippetDomain: string | null;
  hasPeopleAlsoAsk: boolean;
  peopleAlsoAsk: string[];
  hasKnowledgePanel: boolean;
  hasLocalPack: boolean;
  hasVideoResults: boolean;
  hasImageResults: boolean;
}

export async function checkSerpFeatures(query: string): Promise<SerpFeatures> {
  const data = await searchGoogle(query, { num: 10 });

  return {
    hasAiOverview: !!data.ai_overview,
    hasFeaturedSnippet: !!data.answer_box || !!data.featured_snippet,
    featuredSnippetDomain: data.answer_box?.link
      ? extractDomain(data.answer_box.link)
      : data.featured_snippet?.link
        ? extractDomain(data.featured_snippet.link)
        : null,
    hasPeopleAlsoAsk: !!(data.related_questions && data.related_questions.length > 0),
    peopleAlsoAsk: (data.related_questions || []).slice(0, 5).map((q: { question?: string }) => q.question || ""),
    hasKnowledgePanel: !!data.knowledge_graph,
    hasLocalPack: !!data.local_results,
    hasVideoResults: !!(data.inline_videos && data.inline_videos.length > 0),
    hasImageResults: !!(data.inline_images && data.inline_images.length > 0),
  };
}

// ============================================
// PERPLEXITY API — GERÇEK CITATION'LAR
// ============================================

export interface PerplexityResult {
  query: string;
  mentioned: boolean;
  mentionPosition: number | null;
  snippet: string | null;
  citations: Array<{ url: string; domain: string }>;
  answer: string;
}

export async function checkPerplexity(query: string, domain: string): Promise<PerplexityResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [{ role: "user", content: query }],
        return_citations: true,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || "";
    const citationUrls: string[] = data.citations || [];

    const citations = citationUrls.map(url => ({
      url,
      domain: extractDomain(url),
    }));

    const domainLower = domain.toLowerCase();
    const mentionIdx = citations.findIndex(c => c.domain.includes(domainLower));

    return {
      query,
      mentioned: mentionIdx >= 0,
      mentionPosition: mentionIdx >= 0 ? mentionIdx + 1 : null,
      snippet: mentionIdx >= 0 ? citations[mentionIdx].url : null,
      citations,
      answer: answer.slice(0, 500),
    };
  } catch {
    return null;
  }
}

// ============================================
// HELPERS
// ============================================

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    // URL parse edilemezse basit regex
    const match = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/\s]+)/);
    return match?.[1]?.toLowerCase() || url;
  }
}
