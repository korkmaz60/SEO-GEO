"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { NoProject } from "@/components/dashboard/no-project";
import { useApi, formatLastUpdated } from "@/hooks/use-api";
import { Users, Trophy, Zap, Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddCompetitorDialog } from "@/components/dashboard/add-competitor-dialog";
import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

interface CompetitorData {
  competitors: {
    name: string; domain: string; seoScore: number; geoScore: number;
    traffic: number; citations: number; isOwn: boolean; shareOfVoice: number;
  }[];
}

const chartConfig = {
  seoScore: { label: "SEO Skor", color: "var(--chart-1)" },
  geoScore: { label: "GEO Skor", color: "var(--chart-4)" },
} satisfies ChartConfig;

export default function CompetitorsPage() {
  const { data, loading, refetch, noProject, lastUpdated } = useApi<CompetitorData>("/api/competitors");
  if (loading) return <PageSkeleton />;
  if (noProject) return <NoProject />;
  const competitors = data?.competitors ?? [];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Users className="size-6 text-primary" /> Rakip Analizi</h1>
          <p className="text-sm text-muted-foreground mt-1">Rakiplerinizle SEO & GEO performans karşılaştırması</p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[10px] text-muted-foreground">Son güncelleme: {formatLastUpdated(lastUpdated)}</span>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refetch} title="Verileri yenile"><RefreshCw className="size-3.5" /></Button>
          <AddCompetitorDialog onSuccess={refetch} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SEO vs GEO Skor Karşılaştırması</CardTitle>
          <CardDescription>Sizin siteniz ve rakiplerinizin skorları</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <BarChart data={competitors} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={8} tick={{ fontSize: 12 }} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
              <Bar dataKey="seoScore" fill="var(--color-seoScore)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="geoScore" fill="var(--color-geoScore)" radius={[4, 4, 0, 0]} />
              <ChartLegend content={<ChartLegendContent />} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {competitors.map((c) => (
          <Card key={c.name} className={c.isOwn ? "border-primary/30" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {c.isOwn && <Trophy className="size-4 text-primary" />}
                  <CardTitle className="text-base">{c.name}</CardTitle>
                </div>
                {c.isOwn && <Badge className="text-[10px]">Siz</Badge>}
              </div>
              <CardDescription>{c.domain}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">SEO Skor</span><span className="text-xs font-bold tabular-nums">{c.seoScore}</span></div>
                  <Progress value={c.seoScore} className="h-2" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">GEO Skor</span><span className="text-xs font-bold tabular-nums">{c.geoScore}</span></div>
                  <Progress value={c.geoScore} className="h-2" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="flex items-center gap-2"><Globe className="size-4 text-muted-foreground" /><div><p className="text-sm font-bold tabular-nums">{c.traffic.toLocaleString("tr-TR")}</p><p className="text-[10px] text-muted-foreground">Organik Trafik</p></div></div>
                <div className="flex items-center gap-2"><Zap className="size-4 text-muted-foreground" /><div><p className="text-sm font-bold tabular-nums">{c.citations}</p><p className="text-[10px] text-muted-foreground">AI Atıfları</p></div></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>AI Share of Voice</CardTitle>
          <CardDescription>AI motorlarında toplam atıflar içindeki payınız</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {competitors.map((c) => (
            <div key={c.name} className="space-y-1.5">
              <div className="flex items-center justify-between"><span className="text-sm font-medium">{c.name}</span><span className="text-sm font-bold tabular-nums">%{c.shareOfVoice}</span></div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full transition-all ${c.isOwn ? "bg-primary" : "bg-muted-foreground/30"}`} style={{ width: `${c.shareOfVoice}%` }} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
