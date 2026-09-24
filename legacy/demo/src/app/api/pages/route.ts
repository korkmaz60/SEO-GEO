import { NextResponse } from "next/server";
import { google } from "googleapis";

import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/get-project";
import { getAuthenticatedClient } from "@/lib/google-auth";
import {
  listSearchConsoleSites,
  parseGoogleMetadata,
  pickSearchConsoleSite,
  stringifyGoogleMetadata,
  type SearchConsoleSiteOption,
} from "@/lib/google-integrations";

type SearchConsoleMetric = {
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  topQuery: string | null;
  topQueryClicks: number | null;
  topQueryImpressions: number | null;
  topQueryPosition: number | null;
};

type SearchConsoleSnapshot = {
  connected: boolean;
  selectedSite: SearchConsoleSiteOption | null;
  metricsLoaded: boolean;
  error: string | null;
  metricsByPath: Map<string, SearchConsoleMetric>;
};

function formatDate(date: Date) {
  return date.toISOString().split("T")[0];
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function projectHostFromDomain(domain: string) {
  return normalizeHost(
    domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, ""),
  );
}

function normalizePath(value: string) {
  if (!value) return "/";

  let normalized = value.trim();
  if (!normalized) return "/";

  if (!normalized.startsWith("/")) {
    normalized = `/${normalized}`;
  }

  const [pathname, query = ""] = normalized.split("?");
  const cleanPathname =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname || "/";

  return query ? `${cleanPathname}?${query}` : cleanPathname;
}

function toProjectPath(rawValue: string, projectDomain: string) {
  try {
    const url = new URL(rawValue);
    const projectHost = projectHostFromDomain(projectDomain);
    const host = normalizeHost(url.hostname);

    if (
      host !== projectHost &&
      !host.endsWith(`.${projectHost}`) &&
      !projectHost.endsWith(`.${host}`)
    ) {
      return null;
    }

    return normalizePath(`${url.pathname}${url.search}`);
  } catch {
    return normalizePath(rawValue);
  }
}

function getVisibility(indexed: boolean, impressions: number, position: number | null) {
  if (!indexed) {
    return {
      status: "not-indexed",
      label: "Index yok",
      rank: 1,
    };
  }

  if (impressions <= 0) {
    return {
      status: "indexed-hidden",
      label: "Indexli, gorunmuyor",
      rank: 2,
    };
  }

  if (position != null && position <= 3) {
    return {
      status: "top-3",
      label: "Top 3",
      rank: 6,
    };
  }

  if (position != null && position <= 10) {
    return {
      status: "top-10",
      label: "Top 10",
      rank: 5,
    };
  }

  if (position != null && position <= 20) {
    return {
      status: "opportunity",
      label: "Yukselme firsati",
      rank: 4,
    };
  }

  return {
    status: "low-visibility",
    label: "Dusuk gorunurluk",
    rank: 3,
  };
}

async function loadSearchConsoleSnapshot({
  accessToken,
  refreshToken,
  preferredSiteUrl,
  projectDomain,
}: {
  accessToken: string | null;
  refreshToken: string | null;
  preferredSiteUrl?: string | null;
  projectDomain: string;
}): Promise<SearchConsoleSnapshot> {
  if (!refreshToken) {
    return {
      connected: false,
      selectedSite: null,
      metricsLoaded: false,
      error: null,
      metricsByPath: new Map(),
    };
  }

  try {
    const client = getAuthenticatedClient(accessToken, refreshToken);
    const sites = await listSearchConsoleSites(client);
    const selectedSite = pickSearchConsoleSite(sites, projectDomain, preferredSiteUrl) ?? null;

    if (!selectedSite) {
      return {
        connected: true,
        selectedSite: null,
        metricsLoaded: false,
        error: "Search Console bagli ama uygun site secilmedi.",
        metricsByPath: new Map(),
      };
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 28);

    const searchconsole = google.searchconsole({ version: "v1", auth: client });

    const [pagesRes, pageQueriesRes] = await Promise.all([
      searchconsole.searchanalytics.query({
        siteUrl: selectedSite.siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ["page"],
          rowLimit: 1000,
        },
      }),
      searchconsole.searchanalytics.query({
        siteUrl: selectedSite.siteUrl,
        requestBody: {
          startDate: formatDate(startDate),
          endDate: formatDate(endDate),
          dimensions: ["page", "query"],
          rowLimit: 2500,
        },
      }),
    ]);

    const metricsByPath = new Map<string, SearchConsoleMetric>();

    for (const row of pagesRes.data.rows ?? []) {
      const pageUrl = row.keys?.[0];
      if (!pageUrl) continue;

      const path = toProjectPath(pageUrl, projectDomain);
      if (!path) continue;

      metricsByPath.set(path, {
        clicks: Math.round(row.clicks ?? 0),
        impressions: Math.round(row.impressions ?? 0),
        ctr: row.ctr != null ? Number((row.ctr * 100).toFixed(2)) : null,
        position: row.position != null ? Number(row.position.toFixed(1)) : null,
        topQuery: null,
        topQueryClicks: null,
        topQueryImpressions: null,
        topQueryPosition: null,
      });
    }

    for (const row of pageQueriesRes.data.rows ?? []) {
      const pageUrl = row.keys?.[0];
      const query = row.keys?.[1];
      if (!pageUrl || !query) continue;

      const path = toProjectPath(pageUrl, projectDomain);
      if (!path) continue;

      const current =
        metricsByPath.get(path) ??
        ({
          clicks: 0,
          impressions: 0,
          ctr: null,
          position: null,
          topQuery: null,
          topQueryClicks: null,
          topQueryImpressions: null,
          topQueryPosition: null,
        } satisfies SearchConsoleMetric);

      const candidateClicks = Math.round(row.clicks ?? 0);
      const candidateImpressions = Math.round(row.impressions ?? 0);
      const shouldReplace =
        !current.topQuery ||
        candidateClicks > (current.topQueryClicks ?? 0) ||
        (candidateClicks === (current.topQueryClicks ?? 0) &&
          candidateImpressions > (current.topQueryImpressions ?? 0));

      if (!shouldReplace) {
        if (!metricsByPath.has(path)) {
          metricsByPath.set(path, current);
        }
        continue;
      }

      metricsByPath.set(path, {
        ...current,
        topQuery: query,
        topQueryClicks: candidateClicks,
        topQueryImpressions: candidateImpressions,
        topQueryPosition: row.position != null ? Number(row.position.toFixed(1)) : null,
      });
    }

    return {
      connected: true,
      selectedSite,
      metricsLoaded: true,
      error: null,
      metricsByPath,
    };
  } catch (error) {
    console.error("Search Console page metrics error:", error);

    return {
      connected: true,
      selectedSite: null,
      metricsLoaded: false,
      error: error instanceof Error ? error.message : "Search Console verisi alinamadi.",
      metricsByPath: new Map(),
    };
  }
}

export async function GET(req: Request) {
  try {
    const ctx = await getActiveProject();
    if (!ctx.auth) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    if (ctx.noProject) {
      return NextResponse.json({
        noProject: true,
        domain: null,
        pages: [],
        stats: {
          total: 0,
          tracked: 0,
          indexed: 0,
          visible: 0,
          top3: 0,
          top10: 0,
          opportunity: 0,
          hiddenIndexed: 0,
          unindexed: 0,
          sitemap: 0,
          internalLink: 0,
          searchConsole: 0,
          llmsTxt: 0,
        },
        searchConsole: {
          connected: false,
          metricsLoaded: false,
          selectedSiteUrl: null,
          selectionLabel: null,
          error: null,
        },
      });
    }

    const { searchParams } = new URL(req.url);
    const includeMetrics =
      searchParams.get("metrics") === "1" || searchParams.get("metrics") === "true";

    const [pages, integration] = await Promise.all([
      db.page.findMany({
        where: { projectId: ctx.projectId, status: "ACTIVE" },
        orderBy: { url: "asc" },
        include: {
          geoScores: { orderBy: { measuredAt: "desc" }, take: 1 },
        },
      }),
      includeMetrics
        ? db.integration.findUnique({
            where: {
              projectId_provider: {
                projectId: ctx.projectId,
                provider: "GOOGLE_SEARCH_CONSOLE",
              },
            },
          })
        : Promise.resolve(null),
    ]);

    const integrationMetadata = parseGoogleMetadata(integration?.metadata ?? null);
    const snapshot =
      includeMetrics && integration
        ? await loadSearchConsoleSnapshot({
            accessToken: integration.accessToken,
            refreshToken: integration.refreshToken,
            preferredSiteUrl: integration.propertyUrl,
            projectDomain: ctx.project.domain,
          })
        : null;

    if (
      integration &&
      snapshot?.selectedSite &&
      (integration.propertyUrl !== snapshot.selectedSite.siteUrl || !integration.metadata)
    ) {
      await db.integration.update({
        where: { id: integration.id },
        data: {
          propertyUrl: snapshot.selectedSite.siteUrl,
          metadata: stringifyGoogleMetadata({
            selectedId: snapshot.selectedSite.siteUrl,
            selectedLabel: snapshot.selectedSite.label,
            availableCount: integrationMetadata?.availableCount,
          }),
        },
      });
    }

    const metricsByPath = snapshot?.metricsByPath ?? new Map<string, SearchConsoleMetric>();
    const knownPaths = new Set<string>();

    const rows = pages.map((page) => {
      const path = normalizePath(page.url);
      knownPaths.add(path);

      const metric = metricsByPath.get(path);
      const clicks = metric?.clicks ?? 0;
      const impressions = metric?.impressions ?? 0;
      const ctr = metric?.ctr ?? null;
      const position = metric?.position ?? null;
      const visibility = getVisibility(page.indexed, impressions, position);

      return {
        id: page.id,
        page: `${page.title ?? ""} ${page.url}`.trim(),
        url: page.url,
        title: page.title,
        wordCount: page.wordCount,
        source: page.source.toLowerCase().replace(/_/g, "-"),
        indexed: page.indexed,
        lastCrawl: page.lastCrawl?.toISOString() ?? null,
        geoScore: page.geoScores[0]?.overallScore ? Math.round(page.geoScores[0].overallScore) : null,
        clicks,
        impressions,
        ctr,
        position,
        topQuery: metric?.topQuery ?? null,
        topQueryClicks: metric?.topQueryClicks ?? null,
        topQueryPosition: metric?.topQueryPosition ?? null,
        visibility: visibility.status,
        visibilityLabel: visibility.label,
        visibilityRank: visibility.rank,
        isSearchConsoleOnly: false,
      };
    });

    if (includeMetrics) {
      for (const [path, metric] of metricsByPath.entries()) {
        if (knownPaths.has(path)) continue;

        const visibility = getVisibility(true, metric.impressions, metric.position);

        rows.push({
          id: `gsc:${path}`,
          page: path,
          url: path,
          title: path === "/" ? ctx.project.domain : path,
          wordCount: null,
          source: "search-console",
          indexed: true,
          lastCrawl: null,
          geoScore: null,
          clicks: metric.clicks,
          impressions: metric.impressions,
          ctr: metric.ctr,
          position: metric.position,
          topQuery: metric.topQuery,
          topQueryClicks: metric.topQueryClicks,
          topQueryPosition: metric.topQueryPosition,
          visibility: visibility.status,
          visibilityLabel: visibility.label,
          visibilityRank: visibility.rank,
          isSearchConsoleOnly: true,
        });
      }
    }

    rows.sort((left, right) => {
      const clickDiff = (right.clicks ?? 0) - (left.clicks ?? 0);
      if (clickDiff !== 0) return clickDiff;

      const impressionDiff = (right.impressions ?? 0) - (left.impressions ?? 0);
      if (impressionDiff !== 0) return impressionDiff;

      return left.url.localeCompare(right.url);
    });

    const stats = {
      total: rows.length,
      tracked: pages.length,
      indexed: rows.filter((page) => page.indexed).length,
      visible: rows.filter((page) => page.impressions > 0).length,
      top3: rows.filter((page) => page.position != null && page.position <= 3).length,
      top10: rows.filter((page) => page.position != null && page.position <= 10).length,
      opportunity: rows.filter(
        (page) => page.indexed && page.impressions > 0 && (page.position == null || page.position > 10),
      ).length,
      hiddenIndexed: rows.filter((page) => page.indexed && page.impressions <= 0).length,
      unindexed: rows.filter((page) => !page.indexed).length,
      sitemap: rows.filter((page) => page.source === "sitemap").length,
      internalLink: rows.filter((page) => page.source === "internal-link").length,
      searchConsole: rows.filter((page) => page.source === "search-console").length,
      llmsTxt: rows.filter((page) => page.source === "llms-txt").length,
    };

    return NextResponse.json({
      domain: ctx.project.domain,
      pages: rows,
      stats,
      searchConsole: {
        connected: snapshot?.connected ?? Boolean(integration?.refreshToken),
        metricsLoaded: snapshot?.metricsLoaded ?? false,
        selectedSiteUrl: snapshot?.selectedSite?.siteUrl ?? integration?.propertyUrl ?? null,
        selectionLabel:
          snapshot?.selectedSite?.label ?? integrationMetadata?.selectedLabel ?? null,
        error: snapshot?.error ?? null,
      },
    });
  } catch (error) {
    console.error("Pages API error:", error);
    return NextResponse.json({ error: "Sayfalar yuklenemedi" }, { status: 500 });
  }
}
