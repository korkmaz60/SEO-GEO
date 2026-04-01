"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";

const chartConfig = {
  seo: {
    label: "SEO Skor",
    color: "var(--chart-1)",
  },
  geo: {
    label: "GEO Skor",
    color: "var(--chart-4)",
  },
} satisfies ChartConfig;

interface TrendChartProps {
  data?: { week: string; seo: number; geo: number }[];
}

export function TrendChart({ data }: TrendChartProps) {
  const chartData = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performans Trendi</CardTitle>
        <CardDescription>Son 12 haftalık SEO & GEO skor değişimi</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
            Trend verisi yükleniyor...
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillSeo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-seo)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-seo)" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="fillGeo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-geo)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--color-geo)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                domain={[40, 100]}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 12 }}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent indicator="dot" />}
              />
              <Area
                dataKey="seo"
                type="natural"
                fill="url(#fillSeo)"
                stroke="var(--color-seo)"
                strokeWidth={2}
                stackId="a"
              />
              <Area
                dataKey="geo"
                type="natural"
                fill="url(#fillGeo)"
                stroke="var(--color-geo)"
                strokeWidth={2}
                stackId="b"
              />
              <ChartLegend content={<ChartLegendContent />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
