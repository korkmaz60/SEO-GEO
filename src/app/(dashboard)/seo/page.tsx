"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { getKeywordColumns, type KeywordRow } from "@/components/dashboard/keyword-columns";
import { ScoreRing } from "@/components/dashboard/score-ring";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { NoProject } from "@/components/dashboard/no-project";
import { useApi, formatLastUpdated } from "@/hooks/use-api";
import { useFeedback } from "@/hooks/use-feedback";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import {
  Search, Globe, Link2, Monitor, Smartphone,
  CheckCircle2, AlertTriangle, XCircle, Info,
  Loader2, Zap, Lightbulb, Plus, RefreshCw,
  TrendingUp, TrendingDown, MousePointerClick, Eye, FileText, BarChart3, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { AddKeywordDialog } from "@/components/dashboard/add-keyword-dialog";
import { KeywordDetailDialog } from "@/components/dashboard/keyword-detail-dialog";
import { KeywordDiscoverTab } from "@/components/dashboard/keyword-discover-tab";
import { useState, useMemo } from "react";

interface SeoData {
  score: {
    overall: number; health: number; speedMobile: number; speedDesktop: number;
    scoreChange: number | null;
    coreWebVitals: { lcp: { value: number; status: string }; inp: { value: number; status: string }; cls: { value: number; status: string } };
  } | null;
  organicTraffic: {
    totalClicks: number; totalImpressions: number; totalQueries: number;
    avgPosition: number | null; avgCtr: number | null; estimatedMonthlyTraffic: number;
  } | null;
  visibilityScore: number;
  positionDistribution: { top3: number; top10: number; top20: number; top50: number; top100: number; total: number } | null;
  backlinks: { total: number; referringDomains: number; domainRank: number } | null;
  keywords: KeywordRow[];
  crawl: { pagesScanned: number; issuesFound: number; status: string; finishedAt: string } | null;
  indexing: { totalPages: number; indexedPages: number; indexRate: number };
  issueSummary: { critical: number; warning: number; notice: number; info: number };
  issues: { category: string; count: number; severity: string; message: string }[];
  trend: { week: string; score: number; health: number }[];
}

const severityConfig: Record<string, { icon: typeof XCircle; variant: "destructive" | "default" }> = {
  critical: { icon: XCircle, variant: "destructive" },
  warning: { icon: AlertTriangle, variant: "default" },
  notice: { icon: Info, variant: "default" },
  info: { icon: Info, variant: "default" },
};

export default function SeoPage() {
  const { data, loading, refetch, noProject, lastUpdated } = useApi<SeoData>("/api/seo");
  const [speedTesting, setSpeedTesting] = useState(false);
  const [serpUpdating, setSerpUpdating] = useState(false);
  const [selectedKw, setSelectedKw] = useState<KeywordRow | null>(null);
  const { feedback, show: showFeedback, clear: clearFeedback } = useFeedback();

  // Organik sorgular (GSC — tracked=false)
  const [organicKeywords, setOrganicKeywords] = useState<KeywordRow[]>([]);
  const [organicLoading, setOrganicLoading] = useState(false);
  const [trackingId, setTrackingId] = useState<string | null>(null);

  async function loadOrganic() {
    setOrganicLoading(true);
    try {
      const res = await fetch("/api/keywords?filter=organic");
      if (res.ok) {
        const json = await res.json();
        setOrganicKeywords(json.keywords ?? []);
      }
    } finally { setOrganicLoading(false); }
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
        showFeedback("success", "Kelime takibe alındı.");
        setOrganicKeywords(prev => prev.filter(k => k.id !== id));
        refetch();
      }
    } finally { setTrackingId(null); }
  }

  async function syncAndRefresh() {
    setSerpUpdating(true);
    try {
      const res = await fetch("/api/keywords/sync", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        showFeedback("success", `Senkronizasyon tamamlandı: ${result.updated ?? 0} sorgu güncellendi.`);
        refetch();
        if (organicKeywords.length > 0) loadOrganic();
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "Senkronizasyon başarısız.");
      }
    } catch { showFeedback("error", "Bağlantı hatası."); }
    finally { setSerpUpdating(false); }
  }

  async function runSpeedTest() {
    setSpeedTesting(true);
    try {
      const res = await fetch("/api/pagespeed", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      if (res.ok) { showFeedback("success", "Hız testi tamamlandı."); refetch(); }
      else { const err = await res.json().catch(() => null); showFeedback("error", err?.error || "Hız testi başarısız."); }
    } catch { showFeedback("error", "Bağlantı hatası."); }
    finally { setSpeedTesting(false); }
  }

  const overviewColumns = useMemo(() => getKeywordColumns(undefined, setSelectedKw), []);
  const keywordColumns = useMemo(() => getKeywordColumns(async (id) => {
    await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
    refetch();
  }, setSelectedKw), [refetch]);

  if (loading) return <PageSkeleton />;
  if (noProject) return <NoProject />;

  const score = data?.score;
  const keywords: KeywordRow[] = data?.keywords ?? [];
  const issues = data?.issues ?? [];
  const crawl = data?.crawl;
  const organic = data?.organicTraffic;
  const posDist = data?.positionDistribution;
  const bl = data?.backlinks;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Search className="size-6 text-seo" /> SEO Analiz</h1>
          <p className="text-sm text-muted-foreground mt-1">Arama motoru optimizasyonu — organik görünürlüğünüzü takip edin</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[10px] text-muted-foreground">Son güncelleme: {formatLastUpdated(lastUpdated)}</span>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} title="Verileri yenile"><RefreshCw className="size-3.5" /></Button>
        </div>
      </div>

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={clearFeedback} />}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="keywords">Takip Edilen</TabsTrigger>
          <TabsTrigger value="organic" onClick={() => { if (organicKeywords.length === 0) loadOrganic(); }}>Organik Sorgular</TabsTrigger>
          <TabsTrigger value="discover" className="gap-1.5"><Lightbulb className="size-3.5" />Keşfet</TabsTrigger>
          <TabsTrigger value="technical">Teknik SEO</TabsTrigger>
          <TabsTrigger value="speed">Sayfa Hızı</TabsTrigger>
        </TabsList>

        {/* ==================== GENEL BAKIŞ ==================== */}
        <TabsContent value="overview" className="space-y-4">
          {/* Üst metrik kartları — Ahrefs tarzı */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="border-seo/20 bg-gradient-to-b from-seo/5">
              <CardContent className="p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <BarChart3 className="size-3.5 text-seo" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">SEO Skor</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{score?.overall ?? 0}</p>
                {score?.scoreChange != null && score.scoreChange !== 0 && (
                  <div className={`flex items-center justify-center gap-0.5 text-[10px] ${score.scoreChange > 0 ? "text-success" : "text-destructive"}`}>
                    {score.scoreChange > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                    {score.scoreChange > 0 ? "+" : ""}{score.scoreChange}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <MousePointerClick className="size-3.5 text-blue-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Organik Trafik</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{organic?.totalClicks?.toLocaleString("tr-TR") ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">tıklama / 28 gün</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Eye className="size-3.5 text-purple-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Gösterim</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{organic?.totalImpressions?.toLocaleString("tr-TR") ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">gösterim / 28 gün</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Search className="size-3.5 text-emerald-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Ort. Pozisyon</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{organic?.avgPosition ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">GSC ortalama</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <Link2 className="size-3.5 text-orange-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Backlink</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">{bl ? bl.referringDomains.toLocaleString("tr-TR") : "—"}</p>
                <p className="text-[10px] text-muted-foreground">{bl ? "referring domain" : "veri yok"}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 text-center space-y-1">
                <div className="flex items-center justify-center gap-1">
                  <FileText className="size-3.5 text-cyan-400" />
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">İndexleme</span>
                </div>
                <p className="text-2xl font-bold tabular-nums">%{data?.indexing.indexRate ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">{data?.indexing.indexedPages ?? 0}/{data?.indexing.totalPages ?? 0} sayfa</p>
              </CardContent>
            </Card>
          </div>

          {/* Pozisyon dağılımı + Sağlık + Hız */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pozisyon dağılımı — SEMrush tarzı */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Pozisyon Dağılımı</CardTitle>
                <CardDescription>Tüm keyword&apos;lerin SERP pozisyonları</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {posDist && posDist.total > 0 ? (
                  <>
                    {[
                      { label: "Top 3", count: posDist.top3, color: "bg-emerald-500", total: posDist.total },
                      { label: "Top 10", count: posDist.top10, color: "bg-blue-500", total: posDist.total },
                      { label: "Top 20", count: posDist.top20, color: "bg-yellow-500", total: posDist.total },
                      { label: "Top 50", count: posDist.top50, color: "bg-orange-500", total: posDist.total },
                      { label: "Top 100", count: posDist.top100, color: "bg-red-500", total: posDist.total },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{item.label}</span>
                          <span className="font-bold tabular-nums">{item.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${item.color} transition-all`} style={{ width: `${item.total > 0 ? (item.count / item.total) * 100 : 0}%` }} />
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground text-center pt-1">Toplam {posDist.total} keyword pozisyonlandı</p>
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-xs">Pozisyon verisi yok</p>
                    <p className="text-[10px] mt-1">Keyword ekleyip sıralama güncelleyin</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sağlık + Sorun özeti */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Site Sağlığı</CardTitle>
                <CardDescription>Teknik SEO durumu</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-center">
                  <ScoreRing score={score?.health ?? 0} size={100} strokeWidth={8} label="Sağlık" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Kritik", count: data?.issueSummary.critical ?? 0, color: "text-red-400 bg-red-500/10" },
                    { label: "Uyarı", count: data?.issueSummary.warning ?? 0, color: "text-yellow-400 bg-yellow-500/10" },
                    { label: "Bilgi", count: data?.issueSummary.notice ?? 0, color: "text-blue-400 bg-blue-500/10" },
                    { label: "İpucu", count: data?.issueSummary.info ?? 0, color: "text-zinc-400 bg-zinc-500/10" },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-lg p-2.5 text-center ${item.color}`}>
                      <p className="text-lg font-bold tabular-nums">{item.count}</p>
                      <p className="text-[10px]">{item.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Sayfa Hızı mini */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Sayfa Hızı</CardTitle>
                <CardDescription>Core Web Vitals durumu</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center space-y-1">
                    <Monitor className="size-5 text-seo mx-auto" />
                    <p className="text-2xl font-bold tabular-nums">{score?.speedDesktop ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Masaüstü</p>
                  </div>
                  <div className="text-center space-y-1">
                    <Smartphone className="size-5 text-seo mx-auto" />
                    <p className="text-2xl font-bold tabular-nums">{score?.speedMobile ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground">Mobil</p>
                  </div>
                </div>
                {score?.coreWebVitals && (
                  <div className="space-y-2">
                    {[
                      { name: "LCP", value: score.coreWebVitals.lcp.value != null ? `${score.coreWebVitals.lcp.value}s` : "—", status: score.coreWebVitals.lcp.status },
                      { name: "INP", value: score.coreWebVitals.inp.value != null ? `${score.coreWebVitals.inp.value}ms` : "—", status: score.coreWebVitals.inp.status },
                      { name: "CLS", value: score.coreWebVitals.cls.value != null ? `${score.coreWebVitals.cls.value}` : "—", status: score.coreWebVitals.cls.status },
                    ].map((v) => (
                      <div key={v.name} className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{v.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold tabular-nums">{v.value}</span>
                          {v.status === "good" ? <CheckCircle2 className="size-3 text-success" /> : <AlertTriangle className="size-3 text-warning" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Takip edilen kelimeler tablosu */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Takip Edilen Kelimeler</CardTitle>
                  <CardDescription>{keywords.length} kelime aktif takipte</CardDescription>
                </div>
                <AddKeywordDialog onSuccess={refetch} />
              </div>
            </CardHeader>
            <CardContent>
              <DataTable columns={overviewColumns} data={keywords} searchKey="keyword" searchPlaceholder="Kelime ara..." pageSize={5} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== TAKİP EDİLEN ==================== */}
        <TabsContent value="keywords" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div><CardTitle>Rank Tracker</CardTitle><CardDescription>{keywords.length} kelime takip ediliyor</CardDescription></div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" disabled={serpUpdating || keywords.length === 0} onClick={syncAndRefresh}>
                    {serpUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
                    {serpUpdating ? "Güncelleniyor..." : "Sıralamaları Güncelle"}
                  </Button>
                  <AddKeywordDialog onSuccess={refetch} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <DataTable columns={keywordColumns} data={keywords} searchKey="keyword" searchPlaceholder="Kelime ara..." pageSize={10} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== ORGANİK SORGULAR ==================== */}
        <TabsContent value="organic" className="space-y-4">
          {/* Organik trafik özet kartları */}
          {organic && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card><CardContent className="p-4 text-center space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tıklama</p>
                <p className="text-xl font-bold tabular-nums">{organic.totalClicks.toLocaleString("tr-TR")}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Gösterim</p>
                <p className="text-xl font-bold tabular-nums">{organic.totalImpressions.toLocaleString("tr-TR")}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Ort. CTR</p>
                <p className="text-xl font-bold tabular-nums">{organic.avgCtr != null ? `%${organic.avgCtr}` : "—"}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4 text-center space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Toplam Sorgu</p>
                <p className="text-xl font-bold tabular-nums">{organic.totalQueries.toLocaleString("tr-TR")}</p>
              </CardContent></Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Organik Sorgular</CardTitle>
                  <CardDescription>
                    Google Search Console&apos;dan gelen arama sorguları — beğendiklerini takibe al
                  </CardDescription>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={serpUpdating} onClick={() => { syncAndRefresh().then(() => loadOrganic()); }}>
                  {serpUpdating ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
                  {serpUpdating ? "Senkronize ediliyor..." : "GSC Senkronize Et"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {organicLoading ? (
                <div className="flex items-center justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
              ) : organicKeywords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="size-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Henüz organik sorgu verisi yok</p>
                  <p className="text-xs mt-1">Ayarlar&apos;dan Google Search Console bağlayıp &ldquo;GSC Senkronize Et&rdquo; butonuna basın</p>
                </div>
              ) : (
                <div className="space-y-0.5">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider border-b">
                    <span className="col-span-4">Sorgu</span>
                    <span className="col-span-1 text-center">Sıra</span>
                    <span className="col-span-2 text-center">Gösterim</span>
                    <span className="col-span-1 text-center">Tıklama</span>
                    <span className="col-span-1 text-center">CTR</span>
                    <span className="col-span-3 text-right">İşlem</span>
                  </div>
                  {organicKeywords.map((kw) => (
                    <div key={kw.id} className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors text-sm border-b border-border/30 last:border-0">
                      <span className="col-span-4 truncate font-medium">{kw.keyword}</span>
                      <span className="col-span-1 text-center">
                        {kw.position ? (
                          <Badge variant={kw.position <= 3 ? "default" : kw.position <= 10 ? "secondary" : "outline"} className="text-[10px] tabular-nums">
                            #{kw.position}
                          </Badge>
                        ) : <span className="text-muted-foreground text-xs">—</span>}
                      </span>
                      <span className="col-span-2 text-center tabular-nums text-xs text-muted-foreground">
                        {kw.impressions?.toLocaleString("tr-TR") ?? "—"}
                      </span>
                      <span className="col-span-1 text-center tabular-nums text-xs text-muted-foreground">
                        {kw.clicks ?? "—"}
                      </span>
                      <span className="col-span-1 text-center tabular-nums text-xs text-muted-foreground">
                        {kw.ctr != null ? `%${kw.ctr}` : "—"}
                      </span>
                      <span className="col-span-3 text-right">
                        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" disabled={trackingId === kw.id} onClick={() => trackKeyword(kw.id)}>
                          {trackingId === kw.id ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
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

        {/* ==================== KEŞFET ==================== */}
        <TabsContent value="discover" className="space-y-4">
          <KeywordDiscoverTab onKeywordAdded={refetch} />
        </TabsContent>

        {/* ==================== TEKNİK SEO ==================== */}
        <TabsContent value="technical" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card><CardContent className="p-5 text-center"><ScoreRing score={score?.health ?? 0} size={90} strokeWidth={7} label="Sağlık Skoru" /></CardContent></Card>
            <Card><CardContent className="p-5 text-center space-y-1.5"><p className="text-3xl font-bold tabular-nums text-red-400">{data?.issueSummary.critical ?? 0}</p><CardDescription>Kritik Sorun</CardDescription></CardContent></Card>
            <Card><CardContent className="p-5 text-center space-y-1.5"><p className="text-3xl font-bold tabular-nums text-yellow-400">{data?.issueSummary.warning ?? 0}</p><CardDescription>Uyarı</CardDescription></CardContent></Card>
            <Card><CardContent className="p-5 text-center space-y-1.5"><p className="text-3xl font-bold tabular-nums">{crawl?.pagesScanned ?? 0}</p><CardDescription>Taranan Sayfa</CardDescription></CardContent></Card>
          </div>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Teknik SEO Sorunları</CardTitle><CardDescription>Son taramada tespit edilen sorunlar</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {issues.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle2 className="size-8 mx-auto mb-2 text-success" />
                  <p className="text-sm">Teknik sorun bulunamadı</p>
                </div>
              ) : issues.map((issue) => { const config = severityConfig[issue.severity] || severityConfig.info; const Icon = config.icon; return (
                <Alert key={issue.category} variant={config.variant}>
                  <Icon className="h-4 w-4" />
                  <AlertTitle className="text-sm">{issue.category}</AlertTitle>
                  <AlertDescription className="flex items-center justify-between"><span>{issue.message}</span><Badge variant="secondary" className="ml-2 tabular-nums text-[10px] shrink-0">{issue.count} sorun</Badge></AlertDescription>
                </Alert>
              ); })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ==================== SAYFA HIZI ==================== */}
        <TabsContent value="speed" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={runSpeedTest} disabled={speedTesting}>
              {speedTesting ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
              {speedTesting ? "Test ediliyor..." : "Hız Testi Çalıştır"}
            </Button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card><CardHeader className="pb-3"><div className="flex items-center gap-2"><Monitor className="size-4 text-seo" /><CardTitle className="text-base">Masaüstü</CardTitle></div></CardHeader><CardContent className="flex flex-col items-center gap-4"><ScoreRing score={score?.speedDesktop ?? 0} size={120} strokeWidth={9} label="Performans" /><Progress value={score?.speedDesktop ?? 0} className="h-2" /></CardContent></Card>
            <Card><CardHeader className="pb-3"><div className="flex items-center gap-2"><Smartphone className="size-4 text-seo" /><CardTitle className="text-base">Mobil</CardTitle></div></CardHeader><CardContent className="flex flex-col items-center gap-4"><ScoreRing score={score?.speedMobile ?? 0} size={120} strokeWidth={9} label="Performans" /><Progress value={score?.speedMobile ?? 0} className="h-2" /></CardContent></Card>
          </div>
          {score?.coreWebVitals && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Core Web Vitals</CardTitle><CardDescription>Google performans metrikleri</CardDescription></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { name: "LCP", fullName: "Largest Contentful Paint", value: score.coreWebVitals.lcp.value != null ? `${score.coreWebVitals.lcp.value}s` : "—", status: score.coreWebVitals.lcp.status, target: "< 2.5s" },
                    { name: "INP", fullName: "Interaction to Next Paint", value: score.coreWebVitals.inp.value != null ? `${score.coreWebVitals.inp.value}ms` : "—", status: score.coreWebVitals.inp.status, target: "< 200ms" },
                    { name: "CLS", fullName: "Cumulative Layout Shift", value: score.coreWebVitals.cls.value != null ? `${score.coreWebVitals.cls.value}` : "—", status: score.coreWebVitals.cls.status, target: "< 0.1" },
                  ].map((v) => (
                    <Card key={v.name}><CardContent className="p-4 text-center space-y-2">
                      <Badge variant={v.status === "good" ? "default" : "secondary"} className="text-[10px]">{v.status === "good" ? <><CheckCircle2 className="size-3 mr-1" />İyi</> : <><AlertTriangle className="size-3 mr-1" />İyileştirilmeli</>}</Badge>
                      <p className="text-2xl font-bold tabular-nums">{v.value}</p>
                      <CardTitle className="text-sm">{v.name}</CardTitle>
                      <CardDescription className="text-[10px]">{v.fullName}</CardDescription>
                      <CardDescription className="text-[10px]">Hedef: {v.target}</CardDescription>
                    </CardContent></Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <KeywordDetailDialog keyword={selectedKw} open={!!selectedKw} onOpenChange={(open) => { if (!open) setSelectedKw(null); }} />
    </div>
  );
}
