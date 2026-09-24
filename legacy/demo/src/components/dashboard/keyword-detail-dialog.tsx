"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { useApi } from "@/hooks/use-api";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KeywordDetailDialogProps {
  keyword: { id: string; keyword: string; position: number | null; volume: number | null; trend: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface KeywordData {
  keywords: {
    id: string;
    keyword: string;
    position: number;
    volume: number;
    history: { position: number; volume: number | null; date: string }[];
  }[];
}

const chartConfig = {
  position: { label: "Pozisyon", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function KeywordDetailDialog({ keyword, open, onOpenChange }: KeywordDetailDialogProps) {
  const { data } = useApi<KeywordData>("/api/keywords");

  if (!keyword) return null;

  const kwData = data?.keywords.find((k) => k.id === keyword.id);
  const history = kwData?.history ?? [];

  // Tarihe göre sırala (eski -> yeni)
  const chartData = [...history]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((h, i) => ({
      week: `Hft ${i + 1}`,
      position: h.position,
    }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {keyword.keyword}
            {keyword.trend === "up" ? <TrendingUp className="size-4 text-success" /> :
             keyword.trend === "down" ? <TrendingDown className="size-4 text-destructive" /> :
             <Minus className="size-4 text-muted-foreground" />}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold tabular-nums">#{keyword.position ?? "—"}</p>
              <CardDescription className="text-[10px]">Mevcut Sıra</CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xl font-bold tabular-nums">{keyword.volume?.toLocaleString("tr-TR") ?? "—"}</p>
              <CardDescription className="text-[10px]">Aylık Hacim</CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Badge variant={keyword.trend === "up" ? "default" : keyword.trend === "down" ? "destructive" : "secondary"} className="text-[10px]">
                {keyword.trend === "up" ? "Yükseliş" : keyword.trend === "down" ? "Düşüş" : "Sabit"}
              </Badge>
              <CardDescription className="text-[10px] mt-1">Trend</CardDescription>
            </CardContent>
          </Card>
        </div>

        {chartData.length > 1 ? (
          <div>
            <CardTitle className="text-sm mb-2">Pozisyon Geçmişi</CardTitle>
            <ChartContainer config={chartConfig} className="h-[200px] w-full">
              <LineChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <YAxis reversed domain={[1, "auto"]} tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line type="monotone" dataKey="position" stroke="var(--color-position)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ChartContainer>
            <p className="text-[10px] text-muted-foreground text-center mt-1">Düşük pozisyon = daha iyi sıralama</p>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Henüz yeterli geçmiş verisi yok
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
