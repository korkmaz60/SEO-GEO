"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  CheckCircle2,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  Loader2,
  RefreshCw,
  Settings,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useApi } from "@/hooks/use-api";

type GoogleProviderKey = "GOOGLE_SEARCH_CONSOLE" | "GOOGLE_ANALYTICS";

interface IntegrationState {
  connected: boolean;
  propertyUrl?: string | null;
  selectionLabel?: string | null;
  availableCount?: number;
}

interface IntegrationStatus {
  integrations: Record<string, IntegrationState>;
  apiKeys: Record<string, boolean>;
  aiProviders: Record<string, boolean>;
}

interface SearchConsolePayload {
  connected: boolean;
  needsSite?: boolean;
  selectedSiteUrl?: string | null;
  selectionLabel?: string | null;
  sites?: Array<{
    siteUrl: string;
    label: string;
    permissionLevel: string | null;
    kind: "domain" | "url-prefix";
  }>;
  overview?: {
    totalClicks: number;
    totalImpressions: number;
    avgCtr: number;
    avgPosition: number;
  };
  error?: string;
}

interface AnalyticsPayload {
  connected: boolean;
  needsProperty?: boolean;
  selectedPropertyId?: string | null;
  selectionLabel?: string | null;
  properties?: Array<{
    id: string;
    label: string;
    account: string | null;
    accountName: string | null;
  }>;
  overview?: {
    organicSessions: number;
    organicUsers: number;
    pageViews: number;
    bounceRate: number;
    avgSessionDuration: number;
  };
  error?: string;
}

const integrationList = [
  {
    key: "GOOGLE_SEARCH_CONSOLE" as const,
    name: "Google Search Console",
    desc: "Arama performansi, tiklama, gosterim ve sorgu verileri",
    icon: "G",
    color: "bg-blue-500/10 text-blue-500",
    type: "google" as const,
    capabilities: ["Sorgular", "Sayfa gorunurlugu", "Coverage sinyali"],
  },
  {
    key: "GOOGLE_ANALYTICS" as const,
    name: "Google Analytics 4",
    desc: "Organik trafik, kullanici davranisi ve landing performansi",
    icon: "GA",
    color: "bg-orange-500/10 text-orange-500",
    type: "google" as const,
    capabilities: ["Organik trafik", "Landing performansi", "Davranis verisi"],
  },
  {
    key: "SERPAPI",
    name: "SerpApi",
    desc: "Google SERP siralama takibi ve index kontrolu",
    icon: "S",
    color: "bg-emerald-500/10 text-emerald-500",
    type: "api_key" as const,
    envKey: "SERPAPI_KEY",
    helpUrl: "serpapi.com",
    helpText: "serpapi.com adresinden hesap acip API key alin.",
    capabilities: ["Index kontrolu", "SERP fallback", "Google sonuclarina hizli erisim"],
    surfaces: ["Pages > Index Kontrol", "Rank check fallback", "Dis kaynak dogrulama"],
  },
  {
    key: "DATAFORSEO",
    name: "DataForSEO",
    desc: "Keyword volume, difficulty ve backlink verisi",
    icon: "DS",
    color: "bg-green-500/10 text-green-500",
    type: "api_key" as const,
    envKey: "DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD",
    helpUrl: "dataforseo.com",
    helpText: "dataforseo.com adresinden hesap acip login/password bilgilerini alin.",
    capabilities: ["Keyword volume", "Competition", "SERP rank check", "Backlink summary"],
    surfaces: ["Keyword Discover", "Keyword Sync", "Backlinks", "Competitors"],
  },
];

const aiProviders = [
  {
    key: "CLAUDE",
    name: "Claude (Anthropic)",
    desc: "GEO analiz ve optimizasyon onerileri",
    icon: "C",
    color: "bg-orange-500/10 text-orange-500",
    envKey: "ANTHROPIC_API_KEY",
    helpUrl: "console.anthropic.com",
    helpText: "console.anthropic.com adresinden API key olusturun.",
    capabilities: ["GEO analiz", "Icerik onerileri", "AI rewrite akisi"],
  },
  {
    key: "GEMINI",
    name: "Gemini (Google)",
    desc: "GEO analiz ve icerik skorlama",
    icon: "G",
    color: "bg-blue-500/10 text-blue-400",
    envKey: "GEMINI_API_KEY",
    helpUrl: "aistudio.google.com",
    helpText: "aistudio.google.com adresinden API key alin.",
    capabilities: ["GEO skor", "Icerik skorlama", "Hizli analiz"],
  },
  {
    key: "OPENAI",
    name: "GPT-4 (OpenAI)",
    desc: "GEO analiz ve icerik optimizasyonu",
    icon: "O",
    color: "bg-emerald-500/10 text-emerald-400",
    envKey: "OPENAI_API_KEY",
    helpUrl: "platform.openai.com",
    helpText: "platform.openai.com adresinden API key olusturun.",
    capabilities: ["GEO analiz", "Optimizasyon onerileri", "Yeniden yazim"],
  },
];

const providerGuides: Record<
  string,
  {
    summary: string;
    unlocks: string[];
    surfaces: string[];
    envSnippet: string;
    note?: string;
  }
> = {
  SERPAPI: {
    summary: "SerpApi, Google sonucunu hizli cekmek icin kullanilir. En buyuk degeri index kontrolu ve hafif SERP dogrulama akisinda verir.",
    unlocks: ["Index kontrolu", "Arama sonucu dogrulama", "Hafif SERP fallback"],
    surfaces: ["Pages > Index Kontrol", "SEO veri dogrulama", "Harici SERP ihtiyaci olan akışlar"],
    envSnippet: 'SERPAPI_KEY="your_api_key_here"',
  },
  DATAFORSEO: {
    summary: "DataForSEO bu uygulamadaki en guclu SEO veri saglayicisidir. Keyword hacmi, competition, backlink ozeti ve SERP rank dogrulama katmanini besler.",
    unlocks: ["Keyword volume", "Competition / zorluk sinyali", "SERP rank check", "Backlink summary", "Rakip domain gucu", "Keyword discovery enrichment"],
    surfaces: ["Keyword Discover", "Keyword Sync sirasinda veri zenginlestirme", "Backlinks ekranı", "Competitor enrichment", "Haftalik otomatik veri yenileme"],
    envSnippet: 'DATAFORSEO_LOGIN="your_email"\nDATAFORSEO_PASSWORD="your_password"',
    note: "Kod tarafinda On-Page API helper'i de hazir. Istenirse ayri bir sayfa bazli DataForSEO audit akisi daha eklenebilir.",
  },
  CLAUDE: {
    summary: "Claude, daha derin GEO yorumlari ve icerik onerileri icin kullanilir.",
    unlocks: ["GEO analiz", "Optimizasyon onerileri", "Rewrite akisi"],
    surfaces: ["Content Analyze", "GEO skor yorumlari", "AI yardimli iyilestirme"],
    envSnippet: 'ANTHROPIC_API_KEY="sk-ant-..."',
  },
  GEMINI: {
    summary: "Gemini, hizli ve maliyet-etkin GEO analiz akisi icin iyi varsayilandir.",
    unlocks: ["GEO skor", "Icerik analiz", "Hizli AI yanitlari"],
    surfaces: ["Content Analyze", "GEO akisi", "Varsayilan AI analiz"],
    envSnippet: 'GEMINI_API_KEY="AIza..."',
  },
  OPENAI: {
    summary: "OpenAI, icerik yeniden yazim ve analiz kalitesini yukari cekmek icin kullanilabilir.",
    unlocks: ["GEO analiz", "Icerik optimizasyonu", "Rewrite akisi"],
    surfaces: ["Content Analyze", "Optimizasyon onerileri", "AI tabanli icerik iyilestirme"],
    envSnippet: 'OPENAI_API_KEY="sk-..."',
  },
};

function MetricCard(props: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{props.label}</p>
      <p className="mt-1 text-base font-semibold">{props.value}</p>
    </div>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");
  const { data, refetch } = useApi<IntegrationStatus>("/api/integrations/status");

  const [connecting, setConnecting] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [apiKeyDialog, setApiKeyDialog] = useState<string | null>(null);
  const [googleDialog, setGoogleDialog] = useState<GoogleProviderKey | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [searchConsoleData, setSearchConsoleData] = useState<SearchConsolePayload | null>(null);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsPayload | null>(null);

  const activeApiItem =
    integrationList.find((item) => item.key === apiKeyDialog) ||
    aiProviders.find((item) => item.key === apiKeyDialog);
  const activeGuide = apiKeyDialog ? providerGuides[apiKeyDialog] : null;
  const googleIntegrations = integrationList.filter((item) => item.type === "google");
  const seoProviders = integrationList.filter((item) => item.type === "api_key");
  const connectedGoogleCount = googleIntegrations.filter(
    (item) => data?.integrations?.[item.key]?.connected ?? false,
  ).length;
  const connectedSeoProviderCount = seoProviders.filter(
    (item) => data?.apiKeys?.[item.key] ?? false,
  ).length;
  const configuredAiCount = aiProviders.filter(
    (provider) => data?.aiProviders?.[provider.key] ?? false,
  ).length;

  async function handleGoogleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/integrations/google/connect");
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
        return;
      }

      alert(json.error || "Baglanti baslatilamadi");
      setConnecting(false);
    } catch {
      setConnecting(false);
    }
  }

  async function fetchGoogleData(provider: GoogleProviderKey) {
    const endpoint =
      provider === "GOOGLE_SEARCH_CONSOLE"
        ? "/api/integrations/search-console"
        : "/api/integrations/analytics";

    const res = await fetch(endpoint);
    const json = await res.json();

    if (!res.ok && !json.connected) {
      throw new Error(json.error || "Google verisi alinamadi");
    }

    if (provider === "GOOGLE_SEARCH_CONSOLE") {
      setSearchConsoleData(json as SearchConsolePayload);
    } else {
      setAnalyticsData(json as AnalyticsPayload);
    }

    return json;
  }

  async function openGoogleDialogFor(provider: GoogleProviderKey) {
    setGoogleDialog(provider);
    setGoogleLoading(true);
    setGoogleError(null);

    try {
      await fetchGoogleData(provider);
    } catch (fetchError) {
      setGoogleError(fetchError instanceof Error ? fetchError.message : "Google verisi alinamadi");
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGoogleRefresh(provider: GoogleProviderKey) {
    const busyToken = `refresh:${provider}`;
    setBusyKey(busyToken);

    try {
      const json = await fetchGoogleData(provider);
      refetch();

      if (
        (provider === "GOOGLE_SEARCH_CONSOLE" && (json as SearchConsolePayload).needsSite) ||
        (provider === "GOOGLE_ANALYTICS" && (json as AnalyticsPayload).needsProperty)
      ) {
        setGoogleDialog(provider);
        setGoogleError(null);
      }
    } catch (fetchError) {
      setGoogleError(fetchError instanceof Error ? fetchError.message : "Veri alinamadi");
      setGoogleDialog(provider);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleSearchConsoleSelection(siteUrl: string) {
    setBusyKey(`select:${siteUrl}`);
    setGoogleError(null);

    try {
      const res = await fetch("/api/integrations/search-console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Site secimi kaydedilemedi");
      }

      await fetchGoogleData("GOOGLE_SEARCH_CONSOLE");
      refetch();
    } catch (selectionError) {
      setGoogleError(selectionError instanceof Error ? selectionError.message : "Site secilemedi");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleAnalyticsSelection(propertyId: string) {
    setBusyKey(`select:${propertyId}`);
    setGoogleError(null);

    try {
      const res = await fetch("/api/integrations/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ propertyId }),
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Property secimi kaydedilemedi");
      }

      await fetchGoogleData("GOOGLE_ANALYTICS");
      refetch();
    } catch (selectionError) {
      setGoogleError(selectionError instanceof Error ? selectionError.message : "Property secilemedi");
    } finally {
      setBusyKey(null);
    }
  }

  const activeGoogleData =
    googleDialog === "GOOGLE_SEARCH_CONSOLE" ? searchConsoleData : googleDialog === "GOOGLE_ANALYTICS" ? analyticsData : null;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Settings className="size-6" /> Ayarlar
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Google connector dahil tum entegrasyonlari ve AI saglayicilarini buradan yonetin.
        </p>
      </div>

      {connected === "google" && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>Google hesabi basariyla baglandi.</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>Baglanti basarisiz: {error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="Google Connector" value={`${connectedGoogleCount}/${googleIntegrations.length}`} />
        <MetricCard label="SEO Veri Kaynagi" value={`${connectedSeoProviderCount}/${seoProviders.length}`} />
        <MetricCard label="AI Saglayici" value={`${configuredAiCount}/${aiProviders.length}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Google Connector'lar</CardTitle>
          <CardDescription>
            Search Console ve GA4 baglantisi tamamlandiginda uygulama canli trafik ve gorunurluk verisiyle calisir.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {googleIntegrations.map((item) => {
            const status = data?.integrations?.[item.key];
            const isConnected = status?.connected ?? false;
            const selectionLabel = status?.selectionLabel;
            const needsSelection = isConnected && !selectionLabel;

            return (
              <div key={item.key} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.color} text-xs font-bold`}>
                      {item.icon}
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{item.name}</p>
                        <Badge variant="outline" className="text-[10px]">OAuth</Badge>
                        {isConnected ? (
                          <Badge variant="outline" className="gap-1 border-green-500/30 text-[10px] text-green-600">
                            <CheckCircle2 className="size-3" /> Hazir
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                            <XCircle className="size-3" /> Eksik
                          </Badge>
                        )}
                        {needsSelection ? (
                          <Badge variant="outline" className="text-[10px] text-amber-600">
                            Secim gerekli
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.capabilities.map((capability) => (
                    <Badge key={capability} variant="outline" className="text-[10px]">
                      {capability}
                    </Badge>
                  ))}
                </div>

                <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <span>Secili kaynak</span>
                    <span className="max-w-[240px] truncate font-medium text-foreground">
                      {selectionLabel || "Henuz secim yapilmadi"}
                    </span>
                  </div>
                  {typeof status?.availableCount === "number" ? (
                    <p className="mt-2">{status.availableCount} kaynak bulundu.</p>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {!isConnected ? (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      onClick={handleGoogleConnect}
                      disabled={connecting}
                    >
                      {connecting ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                      Google ile Bagla
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => openGoogleDialogFor(item.key)}
                        disabled={busyKey === `refresh:${item.key}` || googleLoading}
                      >
                        <Settings className="size-3.5" />
                        {selectionLabel ? "Yonet" : item.key === "GOOGLE_ANALYTICS" ? "Property Sec" : "Site Sec"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        onClick={() => handleGoogleRefresh(item.key)}
                        disabled={busyKey === `refresh:${item.key}`}
                      >
                        {busyKey === `refresh:${item.key}` ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="size-3.5" />
                        )}
                        Yenile
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>SEO Veri Saglayicilari</CardTitle>
          <CardDescription>
            Bu katmanlar keyword, backlink ve SERP verisini besler. DataForSEO en genis kapsamli veri saglayicisidir.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {seoProviders.map((item) => {
            const isConnected = data?.apiKeys?.[item.key] ?? false;

            return (
              <div key={item.key} className="rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.color} text-xs font-bold`}>
                      {item.icon}
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{item.name}</p>
                        <Badge variant="outline" className="text-[10px]">API Key</Badge>
                        {isConnected ? (
                          <Badge variant="outline" className="gap-1 border-green-500/30 text-[10px] text-green-600">
                            <CheckCircle2 className="size-3" /> Hazir
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                            <XCircle className="size-3" /> Eksik
                          </Badge>
                        )}
                        {item.key === "DATAFORSEO" ? (
                          <Badge variant="outline" className="text-[10px] text-blue-600">
                            Ana SEO veri kaynagi
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {item.capabilities.map((capability) => (
                    <Badge key={capability} variant="outline" className="text-[10px]">
                      {capability}
                    </Badge>
                  ))}
                </div>

                {"surfaces" in item && item.surfaces ? (
                  <div className="mt-3 rounded-lg border bg-muted/40 p-3">
                    <p className="text-xs font-medium">Uygulamada kullanim alanlari</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.surfaces.map((surface) => (
                        <Badge key={surface} variant="secondary" className="text-[10px]">
                          {surface}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setApiKeyDialog(item.key)}>
                    <KeyRound className="size-3.5" />
                    {isConnected ? "Detaylari Gor" : "Kurulumu Goster"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!googleDialog} onOpenChange={() => setGoogleDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {googleDialog === "GOOGLE_SEARCH_CONSOLE" ? "Google Search Console Secimi" : "Google Analytics 4 Property Secimi"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {googleError ? (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{googleError}</AlertDescription>
              </Alert>
            ) : null}

            {googleLoading ? (
              <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Google kaynaklari yukleniyor...
              </div>
            ) : null}

            {!googleLoading && googleDialog === "GOOGLE_SEARCH_CONSOLE" && searchConsoleData ? (
              <>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm font-medium">Secili Search Console kaynagi</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {searchConsoleData.selectionLabel || "Henuz secim yapilmadi"}
                  </p>
                </div>

                {searchConsoleData.overview ? (
                  <div className="grid gap-3 md:grid-cols-4">
                    <MetricCard label="Tiklama" value={searchConsoleData.overview.totalClicks} />
                    <MetricCard label="Gosterim" value={searchConsoleData.overview.totalImpressions} />
                    <MetricCard label="CTR" value={`${searchConsoleData.overview.avgCtr}%`} />
                    <MetricCard label="Ort. Pozisyon" value={searchConsoleData.overview.avgPosition} />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Erisilebilen siteler</p>
                  <ScrollArea className="h-72 rounded-lg border">
                    <div className="space-y-2 p-3">
                      {(searchConsoleData.sites ?? []).map((site) => {
                        const isSelected = searchConsoleData.selectedSiteUrl === site.siteUrl;
                        const busyToken = `select:${site.siteUrl}`;

                        return (
                          <button
                            key={site.siteUrl}
                            type="button"
                            className={`w-full rounded-lg border p-3 text-left transition ${
                              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                            }`}
                            onClick={() => handleSearchConsoleSelection(site.siteUrl)}
                            disabled={busyKey === busyToken}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{site.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  {site.kind === "domain" ? "Domain property" : "URL prefix"} · {site.permissionLevel || "unknown"}
                                </p>
                              </div>
                              {busyKey === busyToken ? (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                              ) : isSelected ? (
                                <CheckCircle2 className="size-4 text-green-600" />
                              ) : null}
                            </div>
                          </button>
                        );
                      })}

                      {(searchConsoleData.sites ?? []).length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          Bu Google hesabinda Search Console site bulunamadi. Once ilgili domain veya URL prefix property'i dogrulayin.
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </div>
              </>
            ) : null}

            {!googleLoading && googleDialog === "GOOGLE_ANALYTICS" && analyticsData ? (
              <>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm font-medium">Secili GA4 property</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {analyticsData.selectionLabel || "Henuz secim yapilmadi"}
                  </p>
                </div>

                {analyticsData.overview ? (
                  <div className="grid gap-3 md:grid-cols-4">
                    <MetricCard label="Organic Sessions" value={analyticsData.overview.organicSessions} />
                    <MetricCard label="Organic Users" value={analyticsData.overview.organicUsers} />
                    <MetricCard label="Page Views" value={analyticsData.overview.pageViews} />
                    <MetricCard label="Bounce Rate" value={`${analyticsData.overview.bounceRate}%`} />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Erisilebilen property'ler</p>
                  <ScrollArea className="h-72 rounded-lg border">
                    <div className="space-y-2 p-3">
                      {(analyticsData.properties ?? []).map((property) => {
                        const isSelected = analyticsData.selectedPropertyId === property.id;
                        const busyToken = `select:${property.id}`;

                        return (
                          <button
                            key={property.id}
                            type="button"
                            className={`w-full rounded-lg border p-3 text-left transition ${
                              isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                            }`}
                            onClick={() => handleAnalyticsSelection(property.id)}
                            disabled={busyKey === busyToken}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium">{property.label}</p>
                                <p className="text-xs text-muted-foreground">
                                  Property ID: {property.id}
                                  {property.accountName ? ` · ${property.accountName}` : ""}
                                </p>
                              </div>
                              {busyKey === busyToken ? (
                                <Loader2 className="size-4 animate-spin text-muted-foreground" />
                              ) : isSelected ? (
                                <CheckCircle2 className="size-4 text-green-600" />
                              ) : null}
                            </div>
                          </button>
                        );
                      })}

                      {(analyticsData.properties ?? []).length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                          Bu Google hesabinda erisilebilir bir GA4 property bulunamadi.
                        </div>
                      ) : null}
                    </div>
                  </ScrollArea>
                </div>
              </>
            ) : null}

            {!googleLoading && activeGoogleData && !googleError ? (
              <p className="text-xs text-muted-foreground">
                {googleDialog === "GOOGLE_SEARCH_CONSOLE"
                  ? "Dogru site secildiginde Search Console sorgulari daha saglikli senkronize edilir."
                  : "Dogru property secildiginde organik trafik kartlari ve landing performansi GA4 uzerinden okunur."}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!apiKeyDialog} onOpenChange={() => setApiKeyDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{activeApiItem?.name} Kurulumu</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <div className="rounded-xl border bg-muted/40 p-4">
              <p className="text-sm font-medium">{activeGuide?.summary || activeApiItem?.helpText}</p>
              {activeGuide?.note ? (
                <p className="mt-2 text-xs text-muted-foreground">{activeGuide.note}</p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <p className="text-sm font-medium">Bu provider ile acilanlar</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(activeGuide?.unlocks || []).map((item) => (
                    <Badge key={item} variant="outline" className="text-[10px]">
                      {item}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm font-medium">Uygulamada kullanildigi yerler</p>
                <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                  {(activeGuide?.surfaces || []).map((item) => (
                    <div key={item} className="rounded-lg border bg-muted/40 px-3 py-2">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-xl border bg-muted/50 p-4">
              <p className="text-sm font-medium">Kurulum adimlari</p>
              <div className="space-y-2 text-xs text-muted-foreground">
                <p>
                  <strong>{activeApiItem?.helpUrl}</strong> adresinden hesap olusturun ve gerekli key veya credentials bilgisini alin.
                </p>
                <p>
                  Asagidaki degerleri projenin <code className="rounded bg-background px-1">.env</code> dosyasina ekleyin:
                </p>
              </div>
              <pre className="overflow-x-auto rounded bg-background p-3 text-xs">
                {activeGuide?.envSnippet || `${activeApiItem?.envKey}="your_key"`}
              </pre>
              <p className="text-xs text-muted-foreground">Ardindan uygulamayi yeniden baslatin ve durumu bu ekrandan kontrol edin.</p>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setApiKeyDialog(null)}>
              Tamam
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>AI Saglayicilari</CardTitle>
          <CardDescription>
            GEO analiz, icerik skorlama ve optimizasyon onerileri icin kullanilan modeller.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-3">
          {aiProviders.map((provider) => {
            const isConfigured = data?.aiProviders?.[provider.key] ?? false;

            return (
              <div key={provider.key} className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${provider.color} text-sm font-bold`}>
                    {provider.icon}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{provider.name}</p>
                      <Badge variant="outline" className="text-[10px]">
                        AI Model
                      </Badge>
                      {isConfigured ? (
                        <Badge variant="outline" className="gap-1 border-green-500/30 text-[10px] text-green-600">
                          <CheckCircle2 className="size-3" /> Hazir
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                          <XCircle className="size-3" /> Eksik
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{provider.desc}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {provider.capabilities.map((capability) => (
                    <Badge key={capability} variant="outline" className="text-[10px]">
                      {capability}
                    </Badge>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setApiKeyDialog(provider.key)}>
                  <KeyRound className="size-3.5" />
                    {isConfigured ? "Detaylari Gor" : "Kurulumu Goster"}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Google API Kurulumu</CardTitle>
          <CardDescription>Search Console ve Analytics connector'larinin minimum OAuth gereksinimleri.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-2 rounded-xl border bg-muted/50 p-4 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">Hizli checklist</p>
            <div className="rounded-lg border bg-background/80 px-3 py-2">1. Google Cloud Console uzerinde proje olustur.</div>
            <div className="rounded-lg border bg-background/80 px-3 py-2">2. Search Console API, Analytics Data API ve Analytics Admin API'yi aktif et.</div>
            <div className="rounded-lg border bg-background/80 px-3 py-2">3. OAuth 2.0 Client ID olustur ve callback URL'i tanimla.</div>
            <div className="rounded-lg border bg-background/80 px-3 py-2">4. Search Console tarafinda domain veya URL prefix property dogrulamasi yap.</div>
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/50 p-4">
            <div>
              <p className="text-sm font-medium">Gerekli .env degerleri</p>
              <pre className="mt-2 overflow-x-auto rounded bg-background p-3 text-xs">{'GOOGLE_CLIENT_ID="..."\nGOOGLE_CLIENT_SECRET="..."'}</pre>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Authorized Origin:</p>
              <code className="mt-1 inline-block rounded bg-background px-2 py-1">http://localhost:3000</code>
            </div>
            <div className="text-xs text-muted-foreground">
              <p>Redirect URI:</p>
              <code className="mt-1 inline-block rounded bg-background px-2 py-1">
                http://localhost:3000/api/integrations/google/callback
              </code>
            </div>
            <a
              href="https://developers.google.com/search/apis"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition hover:bg-background"
            >
              <ExternalLink className="size-3.5" /> Google API Dokumani
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
