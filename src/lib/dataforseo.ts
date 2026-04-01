import "server-only";

const DATAFORSEO_API = "https://api.dataforseo.com/v3";

function getAuthHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataForSEO credentials not configured");
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function apiRequest<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${DATAFORSEO_API}${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`DataForSEO API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// SERP sıralama kontrolü
export async function checkSerpRanking(keyword: string, domain: string, location = 2792 /* Turkey */) {
  const data = await apiRequest<DataForSEOResponse>("/serp/google/organic/live/regular", [
    {
      keyword,
      location_code: location,
      language_code: "tr",
      device: "desktop",
      depth: 100,
    },
  ]);

  const results = data?.tasks?.[0]?.result?.[0]?.items || [];
  const domainResult = results.find((item: SerpItem) =>
    item.domain?.includes(domain) || item.url?.includes(domain)
  );

  return {
    keyword,
    position: domainResult?.rank_absolute ?? null,
    url: domainResult?.url ?? null,
    title: domainResult?.title ?? null,
    totalResults: data?.tasks?.[0]?.result?.[0]?.items_count ?? 0,
  };
}

// Keyword hacim ve zorluk verileri
export async function getKeywordData(keywords: string[], location = 2792) {
  const data = await apiRequest<DataForSEOResponse>("/keywords_data/google_ads/search_volume/live", [
    {
      keywords,
      location_code: location,
      language_code: "tr",
    },
  ]);

  const results = data?.tasks?.[0]?.result || [];
  return results.map((item: KeywordDataItem) => ({
    keyword: item.keyword,
    volume: item.search_volume ?? 0,
    competition: item.competition ?? "UNKNOWN",
    competitionIndex: item.competition_index ?? null,
    cpc: item.cpc ?? 0,
    monthlySearches: item.monthly_searches ?? [],
  }));
}

// Backlink özeti
export async function getBacklinkSummary(domain: string) {
  const data = await apiRequest<DataForSEOResponse>("/backlinks/summary/live", [
    {
      target: domain,
      internal_list_limit: 0,
      include_subdomains: true,
    },
  ]);

  const result = data?.tasks?.[0]?.result?.[0];
  return {
    totalBacklinks: result?.total_backlinks ?? 0,
    referringDomains: result?.referring_domains ?? 0,
    brokenBacklinks: result?.broken_backlinks ?? 0,
    referringIps: result?.referring_ips ?? 0,
    domainRank: result?.rank ?? 0,
  };
}

// On-page analiz
export async function analyzeOnPage(url: string) {
  const data = await apiRequest<DataForSEOResponse>("/on_page/instant_pages", [
    {
      url,
      enable_javascript: true,
    },
  ]);

  const page = data?.tasks?.[0]?.result?.[0]?.items?.[0];
  if (!page) return null;

  return {
    url: page.url,
    statusCode: page.status_code,
    title: page.meta?.title,
    description: page.meta?.description,
    h1: page.meta?.htags?.h1?.[0] ?? null,
    wordCount: page.page_metrics?.words_count ?? 0,
    internalLinks: page.page_metrics?.links_internal ?? 0,
    externalLinks: page.page_metrics?.links_external ?? 0,
    images: page.page_metrics?.images_count ?? 0,
    imagesWithoutAlt: page.page_metrics?.images_without_alt ?? 0,
    loadTime: page.page_timing?.duration ?? null,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type DataForSEOResponse = any;
type SerpItem = any;
type KeywordDataItem = any;
