import "server-only";

import { google } from "googleapis";

type GoogleAuth = InstanceType<typeof google.auth.OAuth2>;

export type GoogleIntegrationMetadata = {
  selectedLabel?: string | null;
  selectedId?: string | null;
  availableCount?: number;
};

export type SearchConsoleSiteOption = {
  siteUrl: string;
  label: string;
  permissionLevel: string | null;
  kind: "domain" | "url-prefix";
};

export type AnalyticsPropertyOption = {
  id: string;
  label: string;
  account: string | null;
  accountName: string | null;
};

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function toProjectHost(domain: string) {
  return normalizeHost(
    domain
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, ""),
  );
}

function hostFromSearchConsoleSite(siteUrl: string) {
  if (siteUrl.startsWith("sc-domain:")) {
    return normalizeHost(siteUrl.slice("sc-domain:".length));
  }

  try {
    return normalizeHost(new URL(siteUrl).hostname);
  } catch {
    return "";
  }
}

function matchesProjectHost(projectHost: string, candidateHost: string) {
  if (!projectHost || !candidateHost) return false;
  return projectHost === candidateHost || projectHost.endsWith(`.${candidateHost}`);
}

export function stringifyGoogleMetadata(metadata: GoogleIntegrationMetadata) {
  return JSON.stringify(metadata);
}

export function parseGoogleMetadata(raw: string | null) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GoogleIntegrationMetadata;
    return {
      selectedLabel: parsed.selectedLabel ?? null,
      selectedId: parsed.selectedId ?? null,
      availableCount: typeof parsed.availableCount === "number" ? parsed.availableCount : undefined,
    } satisfies GoogleIntegrationMetadata;
  } catch {
    return null;
  }
}

export async function listSearchConsoleSites(auth: GoogleAuth): Promise<SearchConsoleSiteOption[]> {
  const searchconsole = google.searchconsole({ version: "v1", auth });
  const response = await searchconsole.sites.list();

  return (response.data.siteEntry ?? [])
    .map((site) => {
      const siteUrl = site.siteUrl ?? "";
      if (!siteUrl) return null;

      const kind = siteUrl.startsWith("sc-domain:") ? "domain" as const : "url-prefix" as const;
      const host = hostFromSearchConsoleSite(siteUrl);

      return {
        siteUrl,
        label: kind === "domain" ? host : siteUrl,
        permissionLevel: site.permissionLevel ?? null,
        kind,
      } satisfies SearchConsoleSiteOption;
    })
    .filter((site): site is SearchConsoleSiteOption => Boolean(site))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function pickSearchConsoleSite(
  sites: SearchConsoleSiteOption[],
  projectDomain: string,
  preferredSiteUrl?: string | null,
) {
  if (preferredSiteUrl) {
    const preferred = sites.find((site) => site.siteUrl === preferredSiteUrl);
    if (preferred) return preferred;
  }

  const projectHost = toProjectHost(projectDomain);

  const ranked = sites
    .map((site) => {
      const candidateHost = hostFromSearchConsoleSite(site.siteUrl);
      let score = 0;

      if (site.siteUrl === `sc-domain:${projectHost}`) score = 400;
      else if (site.kind === "domain" && matchesProjectHost(projectHost, candidateHost)) score = 300;
      else if (candidateHost === projectHost) score = 200;
      else if (matchesProjectHost(projectHost, candidateHost)) score = 100;

      return { site, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.site ?? null;
}

export async function listAnalyticsProperties(auth: GoogleAuth): Promise<AnalyticsPropertyOption[]> {
  const admin = google.analyticsadmin({ version: "v1beta", auth });
  const properties: AnalyticsPropertyOption[] = [];
  let pageToken: string | undefined;

  do {
    const response = await admin.accountSummaries.list({
      pageSize: 200,
      pageToken,
    });

    for (const account of response.data.accountSummaries ?? []) {
      for (const property of account.propertySummaries ?? []) {
        const id = property.property?.replace("properties/", "");
        if (!id) continue;

        properties.push({
          id,
          label: property.displayName || `Property ${id}`,
          account: account.account ?? null,
          accountName: account.displayName ?? null,
        });
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return properties.sort((left, right) => left.label.localeCompare(right.label));
}

export function pickAnalyticsProperty(
  properties: AnalyticsPropertyOption[],
  preferredPropertyId?: string | null,
) {
  if (preferredPropertyId) {
    const preferred = properties.find((property) => property.id === preferredPropertyId);
    if (preferred) return preferred;
  }

  if (properties.length === 1) {
    return properties[0];
  }

  return null;
}
