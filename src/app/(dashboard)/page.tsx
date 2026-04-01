"use client";

import {
  Brain,
  Search,
  Zap,
  Globe,
  Eye,
  FileText,
  ArrowUpRight,
  Link2,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/dashboard/score-ring";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { AiVisibilityCard } from "@/components/dashboard/ai-visibility-card";
import { TopKeywordsTable } from "@/components/dashboard/top-keywords-table";
import { RecentAlerts } from "@/components/dashboard/recent-alerts";
import { DashboardSkeleton } from "@/components/ui/loading-skeleton";
import { NoProject } from "@/components/dashboard/no-project";
import { DateRangeSelect } from "@/components/dashboard/date-range-select";
import { useApi, formatLastUpdated } from "@/hooks/use-api";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardData {
  overview: {
    unifiedScore: number;
    geoScore: number;
    seoScore: number;
    healthScore: number;
    totalKeywords: number;
    aiVisibility: number;
    citationCount: number;
    indexedPages: number;
    totalPages: number;
    backlinks: number;
    trafficChange: number;
    lastCrawl: { pagesScanned: number; issuesFound: number; date: string } | null;
  };
  geoBreakdown: {
    authority: number;
    readability: number;
    structure: number;
    technical: number;
  } | null;
  seoBreakdown: {
    speedMobile: number;
    speedDesktop: number;
    health: number;
    lcp: number | null;
    inp: number | null;
    cls: number | null;
  } | null;
  aiPlatforms: { platform: string; visibility: number; citations: number; change: number }[];
  trends: { week: string; geo: number; seo: number }[];
  alerts: { type: string; message: string; time: string; read: boolean }[];
}

export default function DashboardPage() {
  const [days, setDays] = useState("28");
  const { data, loading, error, noProject, lastUpdated, refetch } = useApi<DashboardData>(`/api/dashboard?days=${days}`);

  if (loading) return <DashboardSkeleton />;
  if (noProject) return <NoProject />;

  if (error || !data) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-2">
          <p className="text-destructive font-medium">Veriler yüklenemedi</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  const { overview, geoBreakdown } = data;

  const performanceLabel =
    overview.unifiedScore >= 80
      ? "Mükemmel"
      : overview.unifiedScore >= 60
        ? "İyi Performans"
        : "İyileştirme Gerekli";

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-[1600px] mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            SEO & GEO performansınızın birleşik görünümü
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground">
              Son güncelleme: {formatLastUpdated(lastUpdated)}
            </span>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} title="Verileri yenile">
            <RefreshCw className="size-3.5" />
          </Button>
          <DateRangeSelect value={days} onChange={setDays} />
        </div>
      </div>

      {/* Unified Score + Breakdown */}
      <Card className="bg-gradient-to-br from-card via-card to-primary/5 border-primary/10">
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row items-center gap-6 sm:gap-8">
            <div className="flex flex-col items-center gap-3">
              <ScoreRing
                score={overview.unifiedScore}
                size={140}
                strokeWidth={10}
                label="Birleşik Skor"
                color="var(--color-primary)"
              />
              <Badge className="bg-primary/10 text-primary border-0 text-xs">
                {performanceLabel}
              </Badge>
            </div>

            <div className="flex gap-8">
              <ScoreRing score={overview.seoScore} size={100} strokeWidth={7} label="SEO Skor" color="var(--color-seo)" />
              <ScoreRing score={overview.geoScore} size={100} strokeWidth={7} label="GEO Skor" color="var(--color-geo)" />
            </div>

            {geoBreakdown && (
              <div className="flex-1 grid grid-cols-2 gap-3 w-full lg:w-auto">
                {[
                  { label: "Otorite", value: geoBreakdown.authority, weight: "30%" },
                  { label: "Okunabilirlik", value: geoBreakdown.readability, weight: "25%" },
                  { label: "Yapı", value: geoBreakdown.structure, weight: "25%" },
                  { label: "Teknik", value: geoBreakdown.technical, weight: "20%" },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border bg-background/50 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</span>
                      <span className="text-[10px] text-muted-foreground">{item.weight}</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold tabular-nums">{item.value}</span>
                      <span className="text-[10px] text-muted-foreground">/100</span>
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-geo transition-all" style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Anahtar Kelime" value={overview.totalKeywords} change={overview.trafficChange} icon={Search} variant="seo" />
        <StatCard title="AI Görünürlük" value={`%${overview.aiVisibility}`} icon={Eye} variant="geo" />
        <StatCard title="Toplam Atıf" value={overview.citationCount} icon={Zap} variant="geo" />
        <StatCard title="İndexli Sayfa" value={`${overview.indexedPages}/${overview.totalPages}`} icon={FileText} variant="seo" />
        <StatCard title="Backlinks" value={overview.backlinks} icon={Link2} variant="seo" />
        <StatCard title="Sağlık Skoru" value={overview.healthScore} suffix="/100" icon={Shield} />
      </div>

      {/* Trend Chart — veritabanından gelen trend verisi */}
      <TrendChart data={data.trends} />

      {/* Bottom Grid — veritabanından */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <AiVisibilityCard data={data.aiPlatforms} />
        <TopKeywordsTable />
        <RecentAlerts data={data.alerts} />
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Hızlı Eylemler</CardTitle>
          <CardDescription>Sık kullanılan işlemlere hızlı erişim</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { title: "GEO Analizi Başlat", desc: "İçeriğinizi AI motorları için analiz edin", icon: Brain, href: "/geo" },
              { title: "Anahtar Kelime Araştır", desc: "Yeni fırsatları keşfedin", icon: Search, href: "/seo" },
              { title: "İçerik Optimize Et", desc: "AI editörü ile içerik skorunuzu artırın", icon: Zap, href: "/content" },
              { title: "Rapor Oluştur", desc: "Detaylı performans raporu alın", icon: FileText, href: "/reports" },
            ].map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="group flex items-start gap-3 rounded-lg border border-border/50 p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/5"
              >
                <div className="rounded-md bg-primary/10 p-2 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <action.icon className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium">{action.title}</span>
                    <ArrowUpRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
