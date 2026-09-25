"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface NewLostPoint {
  date: string;
  new: number;
  lost: number;
}

interface NewLostChartProps {
  data: NewLostPoint[];
  labels: { new: string; lost: string; date: string; tableView: string };
  formatDate: (date: string) => string;
  formatValue: (value: number) => string;
}

/**
 * Gains above and losses below a zero baseline, per period: diverging blue (new) and red
 * (lost) bars with the chart rules — one y-axis, a legend, a tooltip per period and the same
 * numbers as a table.
 */
export function NewLostChart({ data, labels, formatDate, formatValue }: NewLostChartProps) {
  const config = {
    new: { label: labels.new, color: "var(--chart-1)" },
    lost: { label: labels.lost, color: "var(--chart-8)" },
  } satisfies ChartConfig;
  // Losses go below the baseline; every label shows them as positive counts.
  const rows = data.map((point) => ({ date: point.date, new: point.new, lost: -point.lost }));

  return (
    <div className="space-y-3">
      <ChartContainer config={config} className="aspect-auto h-60 w-full">
        <BarChart
          data={rows}
          stackOffset="sign"
          barCategoryGap="20%"
          margin={{ top: 8, right: 12, left: 4, bottom: 0 }}
        >
          <CartesianGrid vertical={false} strokeOpacity={0.5} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={formatDate}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            allowDecimals={false}
            tickFormatter={(value: number) => formatValue(Math.abs(value))}
          />
          <ReferenceLine y={0} stroke="var(--border)" />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatDate(String(value))}
                formatter={(value, name) => (
                  <div className="flex w-full items-center gap-2">
                    <span
                      className="h-0.5 w-3 shrink-0 rounded-full"
                      style={{ background: `var(--color-${String(name)})` }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">
                      {config[String(name) as keyof typeof config]?.label}
                    </span>
                    <span className="ml-auto font-medium tabular-nums">
                      {typeof value === "number" ? formatValue(Math.abs(value)) : "—"}
                    </span>
                  </div>
                )}
              />
            }
          />
          <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
          <Bar
            dataKey="new"
            stackId="period"
            fill="var(--color-new)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
          <Bar
            dataKey="lost"
            stackId="period"
            fill="var(--color-lost)"
            radius={[0, 0, 4, 4]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>

      <details className="rounded-lg border text-sm">
        <summary className="cursor-pointer px-3 py-2 text-muted-foreground">
          {labels.tableView}
        </summary>
        <div className="max-h-72 overflow-y-auto border-t">
          <table className="w-full text-left">
            <caption className="sr-only">{labels.tableView}</caption>
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{labels.date}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.new}</th>
                <th className="px-3 py-2 text-right font-medium">{labels.lost}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date} className="border-t">
                  <td className="px-3 py-1.5">{formatDate(point.date)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatValue(point.new)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatValue(point.lost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
