"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreRing } from "@/components/dashboard/score-ring";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { NoProject } from "@/components/dashboard/no-project";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Brain,
  Globe,
  Zap,
  TrendingUp,
  FileText,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Eye,
} from "lucide-react";
import { useState } from "react";
import { useFeedback } from "@/hooks/use-feedback";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { formatLastUpdated } from "@/hooks/use-api";
import { RefreshCw } from "lucide-react";

interface ChecklistItem {
  item: string;
  status: "pass" | "warning" | "fail";
  impact: string;
  message: string | null;
  checkedAt: string;
}

interface GeoData {
  score: { overall: number; authority: number; readability: number; structure: number; technical: number } | null;
  pageScores: { pageUrl: string; pageTitle: string; score: number; authority: number; readability: number; structure: number; technical: number }[];
  platforms: { platform: string; visibility: number; citations: number; change: number }[];
  topCitedPages: { url: string; title: string; citations: number; platforms: string[]; geoScore: number | null }[];
  totalCitations: number;
  checklist: ChecklistItem[];
}

const platformLabels: Record<string, string> = {
  GOOGLE_AI_OVERVIEW: "Google AI Overviews",
  CHATGPT: "ChatGPT",
  PERPLEXITY: "Perplexity",
  CLAUDE: "Claude",
};

// Checklist artık API'den geliyor (ContentCheck tablosu)

const statusConfig = {
  pass: { icon: CheckCircle2, className: "text-success", label: "Geçti" },
  warning: { icon: AlertTriangle, className: "text-warning", label: "İyileştir" },
  fail: { icon: XCircle, className: "text-destructive", label: "Kritik" },
};

export default function GeoPage() {
  const { data, loading, noProject, refetch, lastUpdated } = useApi<GeoData>("/api/geo");
  const [visChecking, setVisChecking] = useState(false);
  const { feedback, show: showFeedback, clear: clearFeedback } = useFeedback();

  async function runVisibilityCheck() {
    setVisChecking(true);
    try {
      const res = await fetch("/api/geo/visibility", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ maxQueries: 5 }) });
      if (res.ok) {
        const result = await res.json();
        showFeedback("success", `AI görünürlük kontrolü tamamlandı. ${result.totalMentions ?? 0} atıf bulundu.`);
        refetch();
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "AI görünürlük kontrolü başarısız oldu.");
      }
    } catch {
      showFeedback("error", "Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally { setVisChecking(false); }
  }

  if (loading) return <PageSkeleton />;
  if (noProject) return <NoProject />;

  const score = data?.score;
  const platforms = data?.platforms ?? [];
  const topCited = data?.topCitedPages ?? [];
  const checklist = data?.checklist ?? [];

  const passCount = checklist.filter((c) => c.status === "pass").length;
  const warnCount = checklist.filter((c) => c.status === "warning").length;
  const failCount = checklist.filter((c) => c.status === "fail").length;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Brain className="size-6 text-geo" />
          GEO Analiz
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generative Engine Optimization — AI motorlarında görünürlüğünüzü optimize edin
        </p>
      </div>
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={clearFeedback} />}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[10px] text-muted-foreground">Son güncelleme: {formatLastUpdated(lastUpdated)}</span>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} title="Verileri yenile"><RefreshCw className="size-3.5" /></Button>
        </div>
        <Button size="sm" className="gap-1.5" onClick={runVisibilityCheck} disabled={visChecking}>
          {visChecking ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          {visChecking ? "AI Kontrol Ediliyor..." : "AI Visibility Kontrol"}
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
          <TabsTrigger value="platforms">AI Platformları</TabsTrigger>
          <TabsTrigger value="citations">Atıf Takibi</TabsTrigger>
          <TabsTrigger value="checklist">GEO Kontrol Listesi</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardContent className="p-6 flex flex-col items-center gap-4">
                <ScoreRing score={score?.overall ?? 0} size={160} strokeWidth={12} label="GEO Skor" color="var(--color-geo)" />
                <p className="text-sm text-muted-foreground text-center">
                  İçerikleriniz AI motorları tarafından {(score?.overall ?? 0) >= 80 ? "yüksek" : (score?.overall ?? 0) >= 60 ? "orta" : "düşük"} seviyede atıflanıyor.
                </p>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">GEO Skor Bileşenleri</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {score && [
                  { label: "Otorite Skoru", value: score.authority, weight: "30%", desc: "E-E-A-T sinyalleri, kaynak güvenilirliği, uzman alıntıları" },
                  { label: "Okunabilirlik", value: score.readability, weight: "25%", desc: "Flesch skoru, cümle uzunluğu, terminoloji dengesi" },
                  { label: "Yapısal Skor", value: score.structure, weight: "25%", desc: "Başlık hiyerarşisi, liste/tablo kullanımı, doğrudan cevap" },
                  { label: "Teknik Skor", value: score.technical, weight: "20%", desc: "Schema markup, sayfa hızı, mobil uyumluluk" },
                ].map((item) => (
                  <div key={item.label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="text-xs text-muted-foreground ml-2">({item.weight})</span>
                      </div>
                      <span className="text-sm font-bold tabular-nums">{item.value}/100</span>
                    </div>
                    <Progress value={item.value} className="h-2" />
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {platforms.map((p) => (
              <Card key={p.platform}>
                <CardContent className="p-4 text-center space-y-2">
                  <Globe className="size-8 text-geo mx-auto" />
                  <p className="text-sm font-medium">{platformLabels[p.platform] || p.platform}</p>
                  <p className="text-3xl font-bold tabular-nums">%{p.visibility}</p>
                  <Badge variant={p.change > 0 ? "default" : "destructive"} className="text-[10px]">
                    {p.change > 0 ? "+" : ""}{p.change}%
                  </Badge>
                  <p className="text-xs text-muted-foreground">{p.citations} atıf</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="platforms" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {platforms.map((platform) => (
              <Card key={platform.platform}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{platformLabels[platform.platform] || platform.platform}</CardTitle>
                    <Badge variant={platform.change > 0 ? "default" : "destructive"}>
                      {platform.change > 0 ? "+" : ""}{platform.change}%
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold tabular-nums">%{platform.visibility}</p>
                      <p className="text-xs text-muted-foreground">Görünürlük</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">{platform.citations}</p>
                      <p className="text-xs text-muted-foreground">Atıf</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold tabular-nums">%80</p>
                      <p className="text-xs text-muted-foreground">Hedef</p>
                    </div>
                  </div>
                  <Progress value={platform.visibility} className="h-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="citations" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">En Çok Atıf Alan İçerikler</CardTitle>
                <Badge variant="secondary">Toplam {data?.totalCitations ?? 0} atıf</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topCited.map((source) => (
                  <div key={source.url} className="flex items-center gap-4 rounded-lg border p-4">
                    <div className="rounded-md bg-geo/10 p-2.5">
                      <FileText className="size-5 text-geo" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{source.url}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {source.platforms.map((p) => (
                          <Badge key={p} variant="outline" className="text-[10px]">
                            {platformLabels[p] || p}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="flex items-center gap-1">
                        <Zap className="size-3 text-geo" />
                        <span className="text-sm font-bold tabular-nums">{source.citations}</span>
                      </div>
                      {source.geoScore && (
                        <p className="text-[10px] text-muted-foreground">GEO: {source.geoScore}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist" className="space-y-4">
          {checklist.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
                <CheckCircle2 className="size-10 text-muted-foreground/30" />
                <div className="space-y-2 max-w-md">
                  <h3 className="font-semibold text-lg">Henüz Analiz Yapılmadı</h3>
                  <p className="text-sm text-muted-foreground">
                    GEO kontrol listesini görmek için &ldquo;İçerik Analiz&rdquo; sayfasından sayfalarınızı AI ile analiz edin.
                    Analiz sonuçları burada otomatik olarak görünecektir.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4 text-center"><CheckCircle2 className="size-8 text-success mx-auto mb-2" /><p className="text-2xl font-bold">{passCount}</p><p className="text-xs text-muted-foreground">Başarılı</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><AlertTriangle className="size-8 text-warning mx-auto mb-2" /><p className="text-2xl font-bold">{warnCount}</p><p className="text-xs text-muted-foreground">İyileştirilmeli</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><XCircle className="size-8 text-destructive mx-auto mb-2" /><p className="text-2xl font-bold">{failCount}</p><p className="text-xs text-muted-foreground">Kritik</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><TrendingUp className="size-8 text-primary mx-auto mb-2" /><p className="text-2xl font-bold">%{checklist.length > 0 ? Math.round((passCount / checklist.length) * 100) : 0}</p><p className="text-xs text-muted-foreground">Tamamlanma</p></CardContent></Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">GEO Optimizasyon Kontrol Listesi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {checklist.map((check, idx) => {
                      const config = statusConfig[check.status];
                      const Icon = config.icon;
                      return (
                        <div key={idx} className="flex items-center gap-3 rounded-lg border p-3">
                          <Icon className={`size-5 shrink-0 ${config.className}`} />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm">{check.item}</span>
                            {check.message && <p className="text-xs text-muted-foreground mt-0.5">{check.message}</p>}
                          </div>
                          <Badge variant={check.impact === "Yüksek" ? "default" : "secondary"} className="text-[10px]">{check.impact} Etki</Badge>
                          <Badge variant={check.status === "pass" ? "outline" : check.status === "warning" ? "secondary" : "destructive"} className="text-[10px] min-w-[60px] justify-center">{config.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
