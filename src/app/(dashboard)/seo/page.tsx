"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  FileSearch,
  FileText,
  Globe,
  Info,
  Lightbulb,
  Loader2,
  Monitor,
  MousePointerClick,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  XCircle,
  Zap,
} from "lucide-react";

import { AddKeywordDialog } from "@/components/dashboard/add-keyword-dialog";
import { getKeywordColumns, type KeywordRow } from "@/components/dashboard/keyword-columns";
import { KeywordDetailDialog } from "@/components/dashboard/keyword-detail-dialog";
import { KeywordDiscoverTab } from "@/components/dashboard/keyword-discover-tab";
import { getPageColumns, type SeoPageRow } from "@/components/dashboard/page-columns";
import { NoProject } from "@/components/dashboard/no-project";
import { ScoreRing } from "@/components/dashboard/score-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatLastUpdated, useApi } from "@/hooks/use-api";
import { useFeedback } from "@/hooks/use-feedback";

interface IssueItem {
  message: string;
  details: string | null;
  pageUrl: string | null;
  pageTitle: string | null;
}

interface SeoIssue {
  category: string;
  count: number;
  severity: string;
  message: string;
  items: IssueItem[];
}

interface SeoData {
  score: {
    overall: number;
    health: number;
    speedMobile: number;
    speedDesktop: number;
    scoreChange: number | null;
    coreWebVitals: {
      lcp: { value: number; status: string };
      inp: { value: number; status: string };
      cls: { value: number; status: string };
    };
  } | null;
  organicTraffic: {
    totalClicks: number;
    totalImpressions: number;
    totalQueries: number;
    avgPosition: number | null;
    avgCtr: number | null;
    estimatedMonthlyTraffic: number;
  } | null;
  visibilityScore: number;
  positionDistribution: {
    top3: number;
    top10: number;
    top20: number;
    top50: number;
    top100: number;
    total: number;
  } | null;
  backlinks: {
    total: number;
    referringDomains: number;
    domainRank: number;
  } | null;
  keywords: KeywordRow[];
  crawl: {
    pagesScanned: number;
    issuesFound: number;
    status: string;
    finishedAt: string;
  } | null;
  indexing: { totalPages: number; indexedPages: number; indexRate: number };
  issueSummary: { critical: number; warning: number; notice: number; info: number };
  issues: SeoIssue[];
  trend: { week: string; score: number; health: number }[];
}

interface SeoPagesData {
  domain: string | null;
  pages: SeoPageRow[];
  stats: {
    total: number;
    tracked: number;
    indexed: number;
    visible: number;
    top3: number;
    top10: number;
    opportunity: number;
    hiddenIndexed: number;
    unindexed: number;
    sitemap: number;
    internalLink: number;
    searchConsole: number;
    llmsTxt: number;
  };
  searchConsole: {
    connected: boolean;
    metricsLoaded: boolean;
    selectedSiteUrl: string | null;
    selectionLabel: string | null;
    error: string | null;
  };
}

const severityConfig: Record<string, { icon: typeof XCircle; tone: string }> = {
  critical: { icon: XCircle, tone: "border-red-500/20 bg-red-500/5 text-red-400" },
  warning: { icon: TriangleAlert, tone: "border-amber-500/20 bg-amber-500/5 text-amber-400" },
  notice: { icon: Info, tone: "border-blue-500/20 bg-blue-500/5 text-blue-400" },
  info: { icon: Info, tone: "border-zinc-500/20 bg-zinc-500/5 text-zinc-300" },
};

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = "default",
  change,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: typeof Search;
  tone?: "default" | "seo" | "traffic" | "success" | "warning";
  change?: number | null;
}) {
  const toneClass =
    tone === "seo"
      ? "border-primary/20 bg-primary/5"
      : tone === "traffic"
        ? "border-blue-500/20 bg-blue-500/5"
        : tone === "success"
          ? "border-emerald-500/20 bg-emerald-500/5"
          : tone === "warning"
            ? "border-amber-500/20 bg-amber-500/5"
            : "";

  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <div className="flex items-end gap-2">
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              {change != null && change !== 0 && (
                <span
                  className={`mb-0.5 flex items-center gap-1 text-xs font-medium ${
                    change > 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {change > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {change > 0 ? "+" : ""}
                  {change}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/80 p-2.5">
            <Icon className="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SnapshotCard({
  title,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: typeof Search;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/5"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/5"
        : tone === "danger"
          ? "border-red-500/20 bg-red-500/5"
          : "";

  return (
    <Card className={toneClass}>
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="text-[11px] text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/80 p-2.5">
          <Icon className="size-4 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function SeoPage() {
  const {
    data,
    loading,
    refetch,
    noProject,
    lastUpdated,
  } = useApi<SeoData>("/api/seo");
  const {
    data: pagesData,
    loading: pagesLoading,
    refetch: refetchPages,
    noProject: pagesNoProject,
    lastUpdated: pagesLastUpdated,
  } = useApi<SeoPagesData>("/api/pages?metrics=1");

  const { feedback, show: showFeedback, clear: clearFeedback } = useFeedback();

  const [speedTesting, setSpeedTesting] = useState(false);
  const [serpUpdating, setSerpUpdating] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [checkingIndex, setCheckingIndex] = useState(false);
  const [selectedKw, setSelectedKw] = useState<KeywordRow | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  const [organicKeywords, setOrganicKeywords] = useState<KeywordRow[]>([]);
  const [organicLoading, setOrganicLoading] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  const overviewColumns = useMemo(() => getKeywordColumns(undefined, setSelectedKw), []);
  const keywordColumns = useMemo(
    () =>
      getKeywordColumns(async (id) => {
        await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
        refetch();
      }, setSelectedKw),
    [refetch],
  );
  const pageColumns = useMemo(() => getPageColumns(), []);

  const keywords = data?.keywords ?? [];
  const issues = data?.issues ?? [];
  const pages = pagesData?.pages ?? [];
  const organic = data?.organicTraffic;
  const posDist = data?.positionDistribution;
  const score = data?.score;
  const crawl = data?.crawl;
  const pagesStats = pagesData?.stats;
  const gscStatus = pagesData?.searchConsole;

  const topPages = useMemo(
    () =>
      [...pages]
        .filter((page) => page.clicks > 0 || page.impressions > 0 || page.position != null)
        .sort((left, right) => {
          const clickDiff = right.clicks - left.clicks;
          if (clickDiff !== 0) return clickDiff;

          const impressionDiff = right.impressions - left.impressions;
          if (impressionDiff !== 0) return impressionDiff;

          return (left.position ?? 999) - (right.position ?? 999);
        })
        .slice(0, 6),
    [pages],
  );

  const lastSeenUpdate = useMemo(() => {
    const timestamps = [lastUpdated?.getTime() ?? 0, pagesLastUpdated?.getTime() ?? 0].filter(Boolean);
    if (!timestamps.length) return null;
    return new Date(Math.max(...timestamps));
  }, [lastUpdated, pagesLastUpdated]);

  async function loadOrganic() {
    setOrganicLoading(true);
    try {
      const res = await fetch("/api/keywords?filter=organic");
      if (res.ok) {
        const json = await res.json();
        setOrganicKeywords(json.keywords ?? []);
      }
    } finally {
      setOrganicLoading(false);
    }
  }

  async function trackKeyword(id: string) {
    setTrackingId(id);
    try {
      const res = await fetch("/api/keywords", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tracked: true }),
      });

      if (res.ok) {
        showFeedback("success", "Kelime takibe alindi.");
        setOrganicKeywords((current) => current.filter((keyword) => keyword.id !== id));
        refetch();
      }
    } finally {
      setTrackingId(null);
    }
  }

  async function syncAndRefresh() {
    setSerpUpdating(true);
    try {
      const res = await fetch("/api/keywords/sync", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        showFeedback("success", `Senkronizasyon tamamlandi: ${result.updated ?? 0} sorgu guncellendi.`);
        refetch();
        refetchPages();
        if (organicKeywords.length > 0) {
          loadOrganic();
        }
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "Senkronizasyon basarisiz.");
      }
    } catch {
      showFeedback("error", "Baglanti hatasi.");
    } finally {
      setSerpUpdating(false);
    }
  }

  async function runSpeedTest() {
    setSpeedTesting(true);
    try {
      const res = await fetch("/api/pagespeed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        showFeedback("success", "Hiz testi tamamlandi.");
        refetch();
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "Hiz testi basarisiz.");
      }
    } catch {
      showFeedback("error", "Baglanti hatasi.");
    } finally {
      setSpeedTesting(false);
    }
  }

  async function discoverPages() {
    setDiscovering(true);
    try {
      const res = await fetch("/api/discover", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        const count = result.saved ?? result.total ?? 0;
        showFeedback("success", `Sayfa kesfi tamamlandi: ${count} sayfa kaydedildi.`);
        refetchPages();
        refetch();
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "Sayfa kesfi basarisiz.");
      }
    } catch {
      showFeedback("error", "Baglanti hatasi.");
    } finally {
      setDiscovering(false);
    }
  }

  async function checkIndex() {
    setCheckingIndex(true);
    try {
      const res = await fetch("/api/pages/check-index", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        showFeedback(
          "success",
          `Index kontrolu tamamlandi: ${result.indexed ?? 0}/${result.total ?? 0} sayfa indexli.`,
        );
        refetchPages();
        refetch();
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "Index kontrolu basarisiz.");
      }
    } catch {
      showFeedback("error", "Baglanti hatasi.");
    } finally {
      setCheckingIndex(false);
    }
  }

  if (loading || pagesLoading) return <PageSkeleton />;
  if (noProject || pagesNoProject) return <NoProject />;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-2.5">
              <Search className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">SEO Workspace</h1>
              <p className="text-sm text-muted-foreground">
                Siralamalar, sayfa gorunurlugu, coverage ve teknik sagligi tek panelde yonetin.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-border/70 bg-background/80">
              <Globe className="size-3" />
              {pagesData?.domain ?? "-"}
            </Badge>
            <Badge
              variant="outline"
              className={`gap-1.5 ${
                gscStatus?.metricsLoaded
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                  : "border-border/70 bg-background/80"
              }`}
            >
              <Eye className="size-3" />
              {gscStatus?.selectionLabel ?? "Search Console baglanmadi"}
            </Badge>
            {lastSeenUpdate && (
              <span className="text-xs text-muted-foreground">
                Son guncelleme: {formatLastUpdated(lastSeenUpdate)}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={discoverPages} disabled={discovering}>
            {discovering ? <Loader2 className="size-3.5 animate-spin" /> : <FileSearch className="size-3.5" />}
            {discovering ? "Kesfediliyor..." : "Sayfa Kesfet"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={checkIndex} disabled={checkingIndex}>
            {checkingIndex ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
            {checkingIndex ? "Kontrol ediliyor..." : "Index Kontrol"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={syncAndRefresh} disabled={serpUpdating}>
            {serpUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {serpUpdating ? "Senkronize..." : "GSC Senkronize"}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => { refetch(); refetchPages(); }} title="Verileri yenile">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={clearFeedback} />}

      <Tabs defaultValue="overview" className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 rounded-xl border bg-background/80 p-1">
          <TabsTrigger value="overview">Genel Bakis</TabsTrigger>
          <TabsTrigger value="pages">Sayfalar</TabsTrigger>
          <TabsTrigger value="keywords">Rank Tracker</TabsTrigger>
          <TabsTrigger value="organic" onClick={() => { if (organicKeywords.length === 0) loadOrganic(); }}>
            Organik Sorgular
          </TabsTrigger>
          <TabsTrigger value="discover" className="gap-1.5">
            <Lightbulb className="size-3.5" />
            Kesfet
          </TabsTrigger>
          <TabsTrigger value="technical">Teknik SEO</TabsTrigger>
          <TabsTrigger value="speed">Sayfa Hizi</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              title="SEO Skoru"
              value={score?.overall ?? 0}
              helper="Genel optimizasyon durumu"
              icon={BarChart3}
              tone="seo"
              change={score?.scoreChange ?? null}
            />
            <MetricCard
              title="Visibility"
              value={data?.visibilityScore?.toFixed(1) ?? "0.0"}
              helper="CTR ve hacim bazli gorunurluk"
              icon={Sparkles}
              tone="traffic"
            />
            <MetricCard
              title="Organik Tiklama"
              value={organic?.totalClicks?.toLocaleString("tr-TR") ?? "-"}
              helper="Son 28 gun"
              icon={MousePointerClick}
              tone="traffic"
            />
            <MetricCard
              title="Gorunen Sayfa"
              value={`${pagesStats?.visible ?? 0}/${pagesStats?.total ?? 0}`}
              helper="Impression alan sayfalar"
              icon={Eye}
              tone="success"
            />
            <MetricCard
              title="Top 10 Sayfa"
              value={pagesStats?.top10 ?? 0}
              helper="Ortalama pozisyonu 10 ve ustu"
              icon={TrendingUp}
              tone="success"
            />
            <MetricCard
              title="Index Coverage"
              value={`${pagesStats?.indexed ?? data?.indexing.indexedPages ?? 0}/${pagesStats?.total ?? data?.indexing.totalPages ?? 0}`}
              helper={`Coverage %${data?.indexing.indexRate ?? 0}`}
              icon={FileText}
              tone="warning"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_0.95fr_0.9fr]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sayfa Gorunurlugu Ozeti</CardTitle>
                <CardDescription>
                  Hangi sayfalar gorunuyor, hangileri indexli ama trafik almiyor, hangileri yukselme firsati veriyor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <SnapshotCard
                    title="Visible Pages"
                    value={pagesStats?.visible ?? 0}
                    helper="Impression alan sayfalar"
                    icon={Eye}
                    tone="success"
                  />
                  <SnapshotCard
                    title="Top 3"
                    value={pagesStats?.top3 ?? 0}
                    helper="Guculu landing sayfalari"
                    icon={Sparkles}
                    tone="success"
                  />
                  <SnapshotCard
                    title="Firsatlar"
                    value={pagesStats?.opportunity ?? 0}
                    helper="Indexli ama ust siraya cikmamis"
                    icon={TrendingUp}
                    tone="warning"
                  />
                  <SnapshotCard
                    title="Gizli Index"
                    value={pagesStats?.hiddenIndexed ?? 0}
                    helper="Indexli ama gosterim almiyor"
                    icon={Search}
                    tone="danger"
                  />
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-medium">Profesyonel coverage yorumu</p>
                      <p className="text-sm text-muted-foreground">
                        {pagesStats && pagesStats.unindexed > 0
                          ? `${pagesStats.unindexed} sayfa halen index disi. Bunlari sitemap, internal link ve teknik tarama ile onceliklendirin.`
                          : "Temel coverage temiz gorunuyor. Artik odak noktasi gorunen sayfalari ust siralara tasimak olmali."}
                      </p>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border bg-background/80 p-3">
                        <p className="text-muted-foreground">Tracked</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{pagesStats?.tracked ?? 0}</p>
                      </div>
                      <div className="rounded-xl border bg-background/80 p-3">
                        <p className="text-muted-foreground">GSC Pages</p>
                        <p className="mt-1 text-xl font-semibold tabular-nums">{pagesStats?.searchConsole ?? 0}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Search Console Durumu</CardTitle>
                <CardDescription>
                  Canli sayfa metrikleri ve secili property bilgisi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {gscStatus?.connected ? "Baglanti aktif" : "Baglanti eksik"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {gscStatus?.selectionLabel ?? "Henüz Search Console property secilmedi."}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`${
                        gscStatus?.metricsLoaded
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                          : "border-border/70 bg-background/80"
                      }`}
                    >
                      {gscStatus?.metricsLoaded ? "Canli veri" : "Kurulum gerekli"}
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3 text-sm">
                    <span className="text-muted-foreground">Secili site</span>
                    <span className="max-w-[220px] truncate text-right font-medium">
                      {gscStatus?.selectedSiteUrl ?? "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3 text-sm">
                    <span className="text-muted-foreground">Page metrics</span>
                    <span className="font-medium">{gscStatus?.metricsLoaded ? "Hazir" : "Bekliyor"}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-3 text-sm">
                    <span className="text-muted-foreground">Visible pages</span>
                    <span className="font-medium tabular-nums">{pagesStats?.visible ?? 0}</span>
                  </div>
                </div>

                {gscStatus?.error && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-sm text-amber-400">
                    {gscStatus.error}
                  </div>
                )}

                {!gscStatus?.connected && (
                  <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm text-muted-foreground">
                    Ayarlar ekranindan Google Search Console baglantisini tamamlamaniz gerekiyor.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Pozisyon Dagilimi</CardTitle>
                <CardDescription>Takip edilen kelimelerin SERP dagilimi.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {posDist && posDist.total > 0 ? (
                  <>
                    {[
                      { label: "Top 3", count: posDist.top3, color: "bg-emerald-500" },
                      { label: "Top 10", count: posDist.top10, color: "bg-blue-500" },
                      { label: "Top 20", count: posDist.top20, color: "bg-amber-500" },
                      { label: "Top 50", count: posDist.top50, color: "bg-orange-500" },
                      { label: "Top 100", count: posDist.top100, color: "bg-red-500" },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-medium tabular-nums">{item.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${item.color}`}
                            style={{ width: `${posDist.total > 0 ? (item.count / posDist.total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                      Toplam {posDist.total} kelime icin pozisyon verisi bulunuyor.
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                    Pozisyon verisi henuz yok. Once anahtar kelime ekleyip GSC veya SERP senkronu yapin.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">Takip Edilen Kelimeler</CardTitle>
                    <CardDescription>{keywords.length} kelime aktif takipte.</CardDescription>
                  </div>
                  <AddKeywordDialog onSuccess={refetch} />
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={overviewColumns}
                  data={keywords}
                  searchKey="keyword"
                  searchPlaceholder="Kelime ara..."
                  pageSize={5}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">En Gorunur Sayfalar</CardTitle>
                <CardDescription>
                  Hangi landing page'lerin tiklama, gosterim ve sorgu bazinda one ciktigini gorebilirsiniz.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {topPages.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Sayfa bazli gorunurluk verisi henuz olusmadi.
                  </div>
                ) : (
                  topPages.map((page) => (
                    <div key={page.id} className="rounded-xl border border-border/70 bg-muted/30 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{page.title || page.url}</p>
                          <p className="truncate text-xs text-muted-foreground">{page.url}</p>
                        </div>
                        <Badge
                          variant={page.position != null && page.position <= 10 ? "secondary" : "outline"}
                          className="tabular-nums"
                        >
                          {page.position != null ? `#${page.position}` : "-"}
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div className="rounded-lg border bg-background/80 p-2">
                          <p className="text-muted-foreground">Tiklama</p>
                          <p className="mt-1 font-medium tabular-nums">{page.clicks.toLocaleString("tr-TR")}</p>
                        </div>
                        <div className="rounded-lg border bg-background/80 p-2">
                          <p className="text-muted-foreground">Gosterim</p>
                          <p className="mt-1 font-medium tabular-nums">{page.impressions.toLocaleString("tr-TR")}</p>
                        </div>
                        <div className="rounded-lg border bg-background/80 p-2">
                          <p className="text-muted-foreground">Top query</p>
                          <p className="mt-1 truncate font-medium">{page.topQuery ?? "-"}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pages" className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <SnapshotCard
              title="Tracked Pages"
              value={pagesStats?.tracked ?? 0}
              helper="Veritabaninda kayitli sayfalar"
              icon={FileText}
            />
            <SnapshotCard
              title="Visible Pages"
              value={pagesStats?.visible ?? 0}
              helper="Impression alan sayfalar"
              icon={Eye}
              tone="success"
            />
            <SnapshotCard
              title="Top 10 Pages"
              value={pagesStats?.top10 ?? 0}
              helper="Ortalama pozisyonu 10 ve uzeri"
              icon={TrendingUp}
              tone="success"
            />
            <SnapshotCard
              title="Opportunity"
              value={pagesStats?.opportunity ?? 0}
              helper="Yukselme potansiyeli olanlar"
              icon={Sparkles}
              tone="warning"
            />
            <SnapshotCard
              title="Hidden Indexed"
              value={pagesStats?.hiddenIndexed ?? 0}
              helper="Indexli ama gorunmeyen sayfalar"
              icon={TriangleAlert}
              tone="danger"
            />
          </div>

          {gscStatus?.error && (
            <FeedbackBanner type="info" message={gscStatus.error} />
          )}

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="text-base">Page Explorer</CardTitle>
                  <CardDescription>
                    Hangi sayfa hangi sorguyla gorunuyor, ortalama sirasi ne ve coverage durumu nasil sorularina tek tabloda yanit verir.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <Badge variant="outline">Toplam {pagesStats?.total ?? 0}</Badge>
                  <Badge variant="outline">Indexli {pagesStats?.indexed ?? 0}</Badge>
                  <Badge variant="outline">Visible {pagesStats?.visible ?? 0}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={pageColumns}
                data={pages}
                searchKey="page"
                searchPlaceholder="Sayfa, URL veya baslik ara..."
                pageSize={10}
                toolbar={
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Sitemap {pagesStats?.sitemap ?? 0}</Badge>
                    <Badge variant="outline">Internal {pagesStats?.internalLink ?? 0}</Badge>
                    <Badge variant="outline">GSC {pagesStats?.searchConsole ?? 0}</Badge>
                  </div>
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="keywords" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Rank Tracker</CardTitle>
                  <CardDescription>{keywords.length} kelime takip ediliyor.</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={serpUpdating || keywords.length === 0}
                    onClick={syncAndRefresh}
                  >
                    {serpUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
                    {serpUpdating ? "Guncelleniyor..." : "Siralamalari Guncelle"}
                  </Button>
                  <AddKeywordDialog onSuccess={refetch} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={keywordColumns}
                data={keywords}
                searchKey="keyword"
                searchPlaceholder="Kelime ara..."
                pageSize={10}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="organic" className="space-y-4">
          {organic && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <SnapshotCard title="Tiklama" value={organic.totalClicks.toLocaleString("tr-TR")} helper="Son 28 gun" icon={MousePointerClick} />
              <SnapshotCard title="Gosterim" value={organic.totalImpressions.toLocaleString("tr-TR")} helper="Search Console" icon={Eye} />
              <SnapshotCard title="Ort. CTR" value={organic.avgCtr != null ? `%${organic.avgCtr}` : "-"} helper="Sorgu bazli ortalama" icon={TrendingUp} />
              <SnapshotCard title="Toplam Sorgu" value={organic.totalQueries.toLocaleString("tr-TR")} helper="Kayitli organik sorgu" icon={Search} />
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle>Organik Sorgular</CardTitle>
                  <CardDescription>
                    Search Console'dan gelen organik sorgular. Yuksek potansiyelli olanlari tek tikla takibe alabilirsiniz.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={serpUpdating}
                  onClick={() => {
                    syncAndRefresh().then(() => loadOrganic());
                  }}
                >
                  {serpUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {serpUpdating ? "Senkronize..." : "GSC Senkronize Et"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {organicLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : organicKeywords.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Organik sorgu verisi yok. Ayarlardan Search Console baglayip senkronizasyon calistirin.
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="grid grid-cols-12 gap-2 border-b px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    <span className="col-span-4">Sorgu</span>
                    <span className="col-span-1 text-center">Sira</span>
                    <span className="col-span-2 text-center">Gosterim</span>
                    <span className="col-span-1 text-center">Tiklama</span>
                    <span className="col-span-1 text-center">CTR</span>
                    <span className="col-span-3 text-right">Islem</span>
                  </div>
                  {organicKeywords.map((keyword) => (
                    <div
                      key={keyword.id}
                      className="grid grid-cols-12 items-center gap-2 border-b border-border/30 px-3 py-2.5 text-sm last:border-0 hover:bg-muted/40"
                    >
                      <span className="col-span-4 truncate font-medium">{keyword.keyword}</span>
                      <span className="col-span-1 text-center">
                        {keyword.position ? (
                          <Badge
                            variant={keyword.position <= 3 ? "default" : keyword.position <= 10 ? "secondary" : "outline"}
                            className="text-[10px] tabular-nums"
                          >
                            #{keyword.position}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </span>
                      <span className="col-span-2 text-center text-xs tabular-nums text-muted-foreground">
                        {keyword.impressions?.toLocaleString("tr-TR") ?? "-"}
                      </span>
                      <span className="col-span-1 text-center text-xs tabular-nums text-muted-foreground">
                        {keyword.clicks ?? "-"}
                      </span>
                      <span className="col-span-1 text-center text-xs tabular-nums text-muted-foreground">
                        {keyword.ctr != null ? `%${keyword.ctr}` : "-"}
                      </span>
                      <span className="col-span-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          disabled={trackingId === keyword.id}
                          onClick={() => trackKeyword(keyword.id)}
                        >
                          {trackingId === keyword.id ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                          Takibe Al
                        </Button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discover" className="space-y-4">
          <KeywordDiscoverTab onKeywordAdded={refetch} />
        </TabsContent>

        <TabsContent value="technical" className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Card>
              <CardContent className="p-4 text-center">
                <ScoreRing score={score?.health ?? 0} size={80} strokeWidth={6} label="Saglik" />
              </CardContent>
            </Card>
            <Card className="border-red-500/20 bg-red-500/5">
              <CardContent className="space-y-1 p-4 text-center">
                <XCircle className="mx-auto size-4 text-red-400" />
                <p className="text-2xl font-bold tabular-nums text-red-400">{data?.issueSummary.critical ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Kritik</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardContent className="space-y-1 p-4 text-center">
                <TriangleAlert className="mx-auto size-4 text-amber-400" />
                <p className="text-2xl font-bold tabular-nums text-amber-400">{data?.issueSummary.warning ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Uyari</p>
              </CardContent>
            </Card>
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="space-y-1 p-4 text-center">
                <Info className="mx-auto size-4 text-blue-400" />
                <p className="text-2xl font-bold tabular-nums text-blue-400">
                  {(data?.issueSummary.notice ?? 0) + (data?.issueSummary.info ?? 0)}
                </p>
                <p className="text-[10px] text-muted-foreground">Bilgi / Ipucu</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-1 p-4 text-center">
                <FileText className="mx-auto size-4 text-muted-foreground" />
                <p className="text-2xl font-bold tabular-nums">{crawl?.pagesScanned ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Taranan Sayfa</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Teknik SEO Sorunlari</CardTitle>
              <CardDescription>
                Son taramada bulunan sorunlari kategori bazinda inceleyin. Etkilenen sayfalar detayda listelenir.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {issues.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  <CheckCircle2 className="mx-auto mb-3 size-10 text-emerald-400" />
                  <p className="text-sm font-medium">Teknik sorun bulunamadi</p>
                  <p className="mt-1 text-xs">Siteniz simdilik saglikli gorunuyor.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {issues.map((issue) => {
                    const config = severityConfig[issue.severity] ?? severityConfig.info;
                    const Icon = config.icon;
                    const isExpanded = expandedIssues.has(issue.category);

                    return (
                      <div key={issue.category} className="overflow-hidden rounded-xl border border-border/70">
                        <button
                          onClick={() => {
                            setExpandedIssues((current) => {
                              const next = new Set(current);
                              if (next.has(issue.category)) next.delete(issue.category);
                              else next.add(issue.category);
                              return next;
                            });
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                        >
                          <div className={`rounded-full p-1.5 ${config.tone}`}>
                            <Icon className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{issue.category}</span>
                              <Badge variant="secondary" className="text-[10px] tabular-nums">
                                {issue.count} sorun
                              </Badge>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">{issue.message}</p>
                          </div>
                          <ChevronDown
                            className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>

                        {isExpanded && issue.items.length > 0 && (
                          <div className="border-t bg-muted/20">
                            <div className="grid grid-cols-12 gap-2 border-b px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              <span className="col-span-5">Sorun Aciklamasi</span>
                              <span className="col-span-4">Etkilenen Sayfa</span>
                              <span className="col-span-3">Detay</span>
                            </div>
                            {issue.items.map((item, index) => (
                              <div
                                key={`${issue.category}-${index}`}
                                className="grid grid-cols-12 gap-2 border-b border-border/30 px-4 py-2.5 text-sm last:border-0 hover:bg-muted/40"
                              >
                                <div className="col-span-5">
                                  <p className="text-xs">{item.message}</p>
                                </div>
                                <div className="col-span-4">
                                  {item.pageUrl ? (
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1">
                                        <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                                        <span className="truncate text-xs text-blue-400" title={item.pageUrl}>
                                          {item.pageUrl}
                                        </span>
                                      </div>
                                      {item.pageTitle && (
                                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={item.pageTitle}>
                                          {item.pageTitle}
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Site geneli</span>
                                  )}
                                </div>
                                <div className="col-span-3">
                                  <p className="break-words text-[10px] text-muted-foreground">{item.details ?? "-"}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="speed" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={runSpeedTest} disabled={speedTesting}>
              {speedTesting ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              {speedTesting ? "Test ediliyor..." : "Hiz Testi Calistir"}
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Monitor className="size-4 text-primary" />
                  <CardTitle className="text-base">Masaustu</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <ScoreRing score={score?.speedDesktop ?? 0} size={120} strokeWidth={9} label="Performans" />
                <Progress value={score?.speedDesktop ?? 0} className="h-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Smartphone className="size-4 text-primary" />
                  <CardTitle className="text-base">Mobil</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                <ScoreRing score={score?.speedMobile ?? 0} size={120} strokeWidth={9} label="Performans" />
                <Progress value={score?.speedMobile ?? 0} className="h-2" />
              </CardContent>
            </Card>
          </div>

          {score?.coreWebVitals && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Core Web Vitals</CardTitle>
                <CardDescription>Google performans metrikleri ve hedef esikler.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  {[
                    {
                      name: "LCP",
                      fullName: "Largest Contentful Paint",
                      value: score.coreWebVitals.lcp.value != null ? `${score.coreWebVitals.lcp.value}s` : "-",
                      status: score.coreWebVitals.lcp.status,
                      target: "< 2.5s",
                    },
                    {
                      name: "INP",
                      fullName: "Interaction to Next Paint",
                      value: score.coreWebVitals.inp.value != null ? `${score.coreWebVitals.inp.value}ms` : "-",
                      status: score.coreWebVitals.inp.status,
                      target: "< 200ms",
                    },
                    {
                      name: "CLS",
                      fullName: "Cumulative Layout Shift",
                      value: score.coreWebVitals.cls.value != null ? `${score.coreWebVitals.cls.value}` : "-",
                      status: score.coreWebVitals.cls.status,
                      target: "< 0.1",
                    },
                  ].map((metric) => (
                    <Card key={metric.name}>
                      <CardContent className="space-y-2 p-4 text-center">
                        <Badge variant={metric.status === "good" ? "secondary" : "outline"}>
                          {metric.status === "good" ? "Iyi" : "Iyilestirilmeli"}
                        </Badge>
                        <p className="text-2xl font-semibold tabular-nums">{metric.value}</p>
                        <CardTitle className="text-sm">{metric.name}</CardTitle>
                        <CardDescription className="text-[11px]">{metric.fullName}</CardDescription>
                        <CardDescription className="text-[11px]">Hedef: {metric.target}</CardDescription>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <KeywordDetailDialog
        keyword={selectedKw}
        open={!!selectedKw}
        onOpenChange={(open) => {
          if (!open) setSelectedKw(null);
        }}
      />
    </div>
  );
}
