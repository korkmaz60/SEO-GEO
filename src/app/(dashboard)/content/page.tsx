"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScoreRing } from "@/components/dashboard/score-ring";
import { AiProviderSelect } from "@/components/dashboard/ai-provider-select";
import { NoProject } from "@/components/dashboard/no-project";
import { useApi } from "@/hooks/use-api";
import {
  FileEdit, Sparkles, CheckCircle2, AlertTriangle,
  Type, Hash, BarChart3, BookOpen, Loader2, Globe,
  LinkIcon, RefreshCw, FileText, Search,
} from "lucide-react";
import { useState } from "react";
import { useFeedback } from "@/hooks/use-feedback";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { formatLastUpdated } from "@/hooks/use-api";

interface PageItem {
  id: string; url: string; title: string; wordCount: number | null;
  source: string; indexed: boolean;
  lastCrawl: string | null; geoScore: number | null;
}

interface PagesData {
  domain: string;
  pages: PageItem[];
  stats: { total: number; indexed: number; sitemap: number; internalLink: number; searchConsole: number; llmsTxt: number };
}

interface AnalysisResult {
  scores: { overall: number; authority: number; readability: number; structure: number; technical: number };
  metrics: { wordCount: number; sentenceCount: number; paragraphCount: number; headingCount: number; questionHeadingCount?: number; listCount: number; linkCount: number; numberCount: number; avgWordsPerSentence: number };
  suggestions: { type: "critical" | "warning" | "success"; text: string }[];
  rewriteSuggestion?: string;
  summary?: string;
  aiPowered?: boolean;
  provider?: string;
}

const suggestionConfig = {
  critical: { icon: AlertTriangle, className: "text-destructive border-destructive/20 bg-destructive/5" },
  warning: { icon: AlertTriangle, className: "text-warning border-warning/20 bg-warning/5" },
  success: { icon: CheckCircle2, className: "text-success border-success/20 bg-success/5" },
};

export default function ContentPage() {
  const { data, loading, noProject, refetch: refetchPages, lastUpdated } = useApi<PagesData>("/api/pages");
  const { feedback, show: showFeedback, clear: clearFeedback } = useFeedback();
  const [selectedPage, setSelectedPage] = useState<PageItem | null>(null);
  const [content, setContent] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [checkingIndex, setCheckingIndex] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiModel, setAiModel] = useState("");
  const [searchFilter, setSearchFilter] = useState("");

  if (noProject) return <NoProject />;

  const pages = data?.pages ?? [];
  const filteredPages = pages.filter((p) =>
    p.url.toLowerCase().includes(searchFilter.toLowerCase()) ||
    p.title?.toLowerCase().includes(searchFilter.toLowerCase())
  );

  async function handleDiscover() {
    setDiscovering(true);
    try {
      const res = await fetch("/api/discover", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        const count = result.discovered ?? result.pages?.length ?? 0;
        showFeedback("success", `Keşif tamamlandı: ${count} sayfa bulundu.`);
        refetchPages();
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "Sayfa keşfi başarısız oldu.");
      }
    } catch {
      showFeedback("error", "Bağlantı hatası.");
    } finally {
      setDiscovering(false);
    }
  }

  async function handleSelectPage(page: PageItem) {
    setSelectedPage(page);
    setResult(null);
    setFetching(true);
    try {
      const projectDomain = data?.domain || "";
      const fullUrl = page.url.startsWith("http")
        ? page.url
        : `https://${projectDomain}${page.url.startsWith("/") ? "" : "/"}${page.url}`;

      const res = await fetch("/api/content-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      });
      if (res.ok) {
        const d = await res.json();
        setContent(d.content);
      } else {
        showFeedback("error", "Sayfa içeriği alınamadı.");
      }
    } catch {
      showFeedback("error", "Bağlantı hatası.");
    } finally { setFetching(false); }
  }

  async function handleFetchManualUrl() {
    if (!manualUrl) return;
    setFetching(true);
    setResult(null);
    setSelectedPage(null);
    try {
      const fullUrl = manualUrl.startsWith("http") ? manualUrl : `https://${manualUrl}`;
      const res = await fetch("/api/content-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: fullUrl }),
      });
      if (res.ok) {
        const d = await res.json();
        setContent(d.content);
        setSelectedPage({ id: "", url: fullUrl, title: d.title, wordCount: d.wordCount, source: "manual", indexed: false, lastCrawl: null, geoScore: null });
      }
    } finally { setFetching(false); }
  }

  async function handleAnalyze() {
    if (!content) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/content-analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, provider: aiProvider, model: aiModel || undefined }),
      });
      if (res.ok) {
        setResult(await res.json());
        showFeedback("success", "AI analiz tamamlandı.");
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "Analiz başarısız oldu. AI sağlayıcı ayarlarını kontrol edin.");
      }
    } catch {
      showFeedback("error", "Bağlantı hatası.");
    } finally { setAnalyzing(false); }
  }

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileEdit className="size-6 text-primary" /> İçerik Analiz
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Sayfalarınızı AI ile analiz edin — GEO & SEO skorlarını iyileştirin
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[10px] text-muted-foreground">Son güncelleme: {formatLastUpdated(lastUpdated)}</span>}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleDiscover} disabled={discovering}>
            {discovering ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            {discovering ? "Keşfediliyor..." : "Sayfaları Keşfet"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" disabled={checkingIndex} onClick={async () => {
            setCheckingIndex(true);
            try {
              const res = await fetch("/api/pages/check-index", { method: "POST" });
              if (res.ok) {
                const result = await res.json();
                showFeedback("success", `Index kontrolü tamamlandı: ${result.indexed ?? 0}/${result.total ?? 0} sayfa indexli.`);
                refetchPages();
              } else {
                const err = await res.json().catch(() => null);
                showFeedback("error", err?.error || "Index kontrolü başarısız. SerpAPI key gerekli.");
              }
            } catch { showFeedback("error", "Bağlantı hatası."); }
            finally { setCheckingIndex(false); }
          }}>
            {checkingIndex ? <Loader2 className="size-3.5 animate-spin" /> : <Globe className="size-3.5" />}
            {checkingIndex ? "Kontrol ediliyor..." : "Index Kontrol"}
          </Button>
        </div>
      </div>

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={clearFeedback} />}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Sol — Sayfalar Listesi */}
        <div className="lg:col-span-3 space-y-3">
          <Card className="h-fit">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sayfalar</CardTitle>
              <CardDescription>
                {data?.stats?.total ?? 0} keşfedildi
                {(data?.stats?.indexed ?? 0) > 0 && ` / ${data?.stats?.indexed} indexlendi`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input placeholder="Sayfa ara..." className="pl-8 h-8 text-xs" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} />
              </div>

              <div className="max-h-[500px] overflow-y-auto space-y-1">
                {filteredPages.length === 0 ? (
                  <div className="text-center py-6 space-y-2">
                    <FileText className="size-8 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs text-muted-foreground">Henüz sayfa yok</p>
                    <Button size="sm" variant="outline" className="text-xs gap-1" onClick={handleDiscover} disabled={discovering}>
                      <RefreshCw className="size-3" /> Keşfet
                    </Button>
                  </div>
                ) : (
                  filteredPages.map((page) => (
                    <button
                      key={page.id}
                      onClick={() => handleSelectPage(page)}
                      className={`w-full text-left rounded-lg border p-2.5 transition-colors text-xs hover:bg-accent ${
                        selectedPage?.url === page.url ? "border-primary bg-primary/5" : "border-transparent"
                      }`}
                    >
                      <p className="font-medium truncate">{page.title || page.url}</p>
                      <p className="text-muted-foreground truncate text-[10px] mt-0.5">{page.url}</p>
                      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                        <Badge variant="outline" className="text-[8px] px-1 py-0">
                          {page.source === "sitemap" ? "Sitemap" :
                           page.source === "search-console" ? "GSC" :
                           page.source === "internal-link" ? "Internal" :
                           page.source === "llms-txt" ? "LLMs.txt" : "Manuel"}
                        </Badge>
                        {page.indexed ? (
                          <Badge variant="default" className="text-[8px] px-1 py-0 gap-0.5">
                            <CheckCircle2 className="size-2" /> İndexli
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[8px] px-1 py-0 text-muted-foreground">
                            İndex yok
                          </Badge>
                        )}
                        {page.geoScore != null && (
                          <Badge variant={page.geoScore >= 70 ? "default" : page.geoScore >= 50 ? "secondary" : "destructive"} className="text-[8px] px-1 py-0">
                            GEO {page.geoScore}
                          </Badge>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Manuel URL */}
              <div className="pt-2 border-t space-y-1.5">
                <p className="text-[10px] text-muted-foreground">veya URL girin</p>
                <div className="flex gap-1">
                  <Input placeholder="https://..." className="h-7 text-[10px]" value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleFetchManualUrl(); }} />
                  <Button size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={handleFetchManualUrl} disabled={fetching}>
                    <LinkIcon className="size-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Orta — İçerik + Analiz */}
        <div className="lg:col-span-6 space-y-4">
          {selectedPage ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm">{selectedPage.title || selectedPage.url}</CardTitle>
                      <CardDescription className="text-[10px]">{selectedPage.url}</CardDescription>
                    </div>
                    <Badge variant="outline" className="text-[10px] tabular-nums">{wordCount} kelime</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {fetching ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
                  ) : (
                    <Textarea className="min-h-[250px] resize-y text-xs leading-relaxed" value={content} onChange={(e) => { setContent(e.target.value); setResult(null); }} />
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <AiProviderSelect value={aiProvider} onChange={setAiProvider} onModelChange={setAiModel} selectedModel={aiModel} />
                    <Button className="gap-2" size="sm" onClick={handleAnalyze} disabled={wordCount < 10 || analyzing}>
                      {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                      {analyzing ? "Analiz ediliyor..." : "AI ile Analiz Et"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {result && (
                <>
                  {result.summary && (
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <Badge variant={result.aiPowered ? "default" : "secondary"} className="text-[10px] shrink-0">{result.aiPowered ? `AI — ${result.provider}` : "Yerel"}</Badge>
                          <p className="text-sm text-muted-foreground">{result.summary}</p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  {result.rewriteSuggestion && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">AI Yeniden Yazım Önerisi</CardTitle></CardHeader>
                      <CardContent><div className="rounded-lg border bg-muted/50 p-3 text-sm leading-relaxed italic">{result.rewriteSuggestion}</div></CardContent>
                    </Card>
                  )}
                  <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-sm">Öneriler</CardTitle><CardDescription>{result.suggestions.length} öneri</CardDescription></CardHeader>
                    <CardContent className="space-y-2">
                      {result.suggestions.map((s, idx) => {
                        const config = suggestionConfig[s.type] || suggestionConfig.warning;
                        const Icon = config.icon;
                        return (<div key={idx} className={`flex items-start gap-3 rounded-lg border p-3 ${config.className}`}><Icon className="size-4 shrink-0 mt-0.5" /><span className="text-sm">{s.text}</span></div>);
                      })}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-20">
                <div className="text-center space-y-3">
                  <Globe className="size-10 text-muted-foreground/30 mx-auto" />
                  <CardTitle className="text-base">Sayfa Seçin</CardTitle>
                  <CardDescription>Soldaki listeden analiz etmek istediğiniz sayfayı seçin<br />veya "Sayfaları Keşfet" ile sitemap'ten sayfaları çekin</CardDescription>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sağ — Skorlar */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardContent className="p-5 flex flex-col items-center gap-3">
              <ScoreRing score={result?.scores?.overall ?? 0} size={120} strokeWidth={9} label="GEO Skor" color="var(--color-geo)" />
              {!result && <p className="text-[10px] text-muted-foreground text-center">Sayfa seçip analiz edin</p>}
            </CardContent>
          </Card>

          {result && (
            <>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Skorlar</CardTitle></CardHeader>
                <CardContent className="space-y-2.5">
                  {[
                    { label: "Otorite", value: result.scores.authority, icon: BookOpen },
                    { label: "Okunabilirlik", value: result.scores.readability, icon: Type },
                    { label: "Yapı", value: result.scores.structure, icon: Hash },
                    { label: "Teknik", value: result.scores.technical, icon: BarChart3 },
                  ].map((item) => (
                    <div key={item.label} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1"><item.icon className="size-3 text-muted-foreground" /><span className="text-[10px] font-medium">{item.label}</span></div>
                        <span className="text-[10px] font-bold tabular-nums">{item.value}</span>
                      </div>
                      <Progress value={item.value} className="h-1" />
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">Metrikler</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                  {[
                    { label: "Kelime", value: result.metrics.wordCount, target: "1500+", ok: result.metrics.wordCount >= 1500 },
                    { label: "Başlık", value: result.metrics.headingCount, target: "3+", ok: result.metrics.headingCount >= 3 },
                    { label: "Soru Başlık", value: result.metrics.questionHeadingCount ?? 0, target: "2+", ok: (result.metrics.questionHeadingCount ?? 0) >= 2 },
                    { label: "Liste", value: result.metrics.listCount, target: "2+", ok: result.metrics.listCount >= 2 },
                    { label: "Link", value: result.metrics.linkCount, target: "2+", ok: result.metrics.linkCount >= 2 },
                    { label: "Sayısal Veri", value: result.metrics.numberCount, target: "3+", ok: result.metrics.numberCount >= 3 },
                  ].map((m) => (
                    <div key={m.label} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{m.label}</span>
                      <div className="flex items-center gap-1">
                        <span className="font-medium tabular-nums">{m.value}</span>
                        <span className="text-muted-foreground">/{m.target}</span>
                        {m.ok ? <CheckCircle2 className="size-2.5 text-success" /> : <AlertTriangle className="size-2.5 text-warning" />}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
