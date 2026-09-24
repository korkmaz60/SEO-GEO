"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { NoProject } from "@/components/dashboard/no-project";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { useApi, formatLastUpdated } from "@/hooks/use-api";
import { useFeedback } from "@/hooks/use-feedback";
import { generatePdfReport } from "@/lib/generate-pdf";
import { FileBarChart, Download, Calendar, FileText, Clock, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";

interface ReportsData {
  reports: {
    id: string; name: string; type: string; format: string;
    fileSize: string | null; status: string; projectName: string; createdAt: string;
  }[];
}

interface DashboardProject {
  project?: { name: string; domain: string };
  overview?: { seoScore: number; geoScore: number; unifiedScore: number };
}

const reportTemplates = [
  { name: "Tam SEO & GEO Raporu", desc: "Tüm metrikleri içeren kapsamlı rapor", icon: FileBarChart, color: "bg-primary/10 text-primary", type: "full" },
  { name: "GEO Performans Raporu", desc: "AI görünürlük ve atıf analizi", icon: FileText, color: "bg-geo/10 text-geo", type: "geo" },
  { name: "Teknik SEO Raporu", desc: "Site sağlığı ve teknik sorunlar", icon: FileText, color: "bg-seo/10 text-seo", type: "technical" },
  { name: "Rakip Analiz Raporu", desc: "Rakiplerle detaylı karşılaştırma", icon: FileText, color: "bg-warning/10 text-warning", type: "competitor" },
];

const typeLabels: Record<string, string> = {
  FULL: "Tam Rapor", GEO: "GEO Raporu", SEO: "SEO Raporu",
  TECHNICAL: "Teknik", COMPETITOR: "Karşılaştırma", WEEKLY_SUMMARY: "Haftalık Özet",
};

export default function ReportsPage() {
  const { data, loading, noProject, lastUpdated, refetch } = useApi<ReportsData>("/api/reports");
  const [generating, setGenerating] = useState<string | null>(null);
  const { feedback, show: showFeedback, clear: clearFeedback } = useFeedback();

  async function handleGeneratePdf(type: string) {
    setGenerating(type);
    try {
      const [dashRes, kwRes, seoRes] = await Promise.all([
        fetch("/api/dashboard").then((r) => r.json()) as Promise<DashboardProject & { overview: { seoScore: number; geoScore: number; unifiedScore: number } }>,
        fetch("/api/keywords").then((r) => r.json()),
        fetch("/api/seo").then((r) => r.json()),
      ]);

      const projectName = dashRes.project?.name ?? "Proje";
      const domain = dashRes.project?.domain ?? "site";

      generatePdfReport({
        projectName,
        domain,
        date: new Date().toLocaleDateString("tr-TR"),
        seoScore: dashRes.overview?.seoScore ?? 0,
        geoScore: dashRes.overview?.geoScore ?? 0,
        unifiedScore: dashRes.overview?.unifiedScore ?? 0,
        keywords: type === "technical" ? [] : (kwRes.keywords ?? []),
        issues: type === "geo" ? [] : (seoRes.issues ?? []),
        pageSpeed: seoRes.score ? { mobile: seoRes.score.speedMobile, desktop: seoRes.score.speedDesktop } : null,
      });

      showFeedback("success", `${reportTemplates.find((t) => t.type === type)?.name ?? "Rapor"} başarıyla oluşturuldu ve indirildi.`);
    } catch {
      showFeedback("error", "Rapor oluşturulurken bir hata oluştu.");
    } finally {
      setGenerating(null);
    }
  }

  if (loading) return <PageSkeleton />;
  if (noProject) return <NoProject />;

  const reports = data?.reports ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileBarChart className="size-6 text-primary" /> Raporlar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Performans raporları oluşturun ve indirin</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[10px] text-muted-foreground">Son güncelleme: {formatLastUpdated(lastUpdated)}</span>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} title="Verileri yenile"><RefreshCw className="size-3.5" /></Button>
        </div>
      </div>

      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={clearFeedback} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {reportTemplates.map((t) => {
          const isGenerating = generating === t.type;
          return (
            <Card
              key={t.name}
              className="cursor-pointer transition-all hover:border-primary/30 hover:shadow-md"
              onClick={() => !generating && handleGeneratePdf(t.type)}
            >
              <CardContent className="p-5 space-y-3">
                <div className={`rounded-lg p-2.5 w-fit ${t.color}`}>
                  {isGenerating ? <Loader2 className="size-5 animate-spin" /> : <t.icon className="size-5" />}
                </div>
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isGenerating ? "Oluşturuluyor..." : t.desc}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Son Raporlar</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Henüz rapor oluşturulmadı</p>
              <p className="text-xs mt-1">Yukarıdaki şablonlardan birini seçerek ilk raporunuzu oluşturun</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
                  <div className="rounded-md bg-primary/10 p-2"><FileText className="size-4 text-primary" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="size-3" />{new Date(r.createdAt).toLocaleDateString("tr-TR")}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">{typeLabels[r.type] || r.type}</Badge>
                      {r.fileSize && <span className="text-[10px] text-muted-foreground">{r.fileSize}</span>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => handleGeneratePdf(r.type.toLowerCase())}
                    disabled={!!generating}
                  >
                    {generating === r.type.toLowerCase() ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                    İndir
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
