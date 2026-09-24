"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface Series {
  key: string;
  label: string;
  /** A chart token, e.g. `var(--chart-1)`; brands use their slot's color. */
  color: string;
}

export type SeriesPoint = { date: string } & Record<string, number | null | string>;

interface TimeSeriesChartProps {
  data: SeriesPoint[];
  series: Series[];
  formatDate: (date: string) => string;
  formatValue: (value: number) => string;
  /** Rankings: 1 at the top. */
  reversed?: boolean;
  yDomain?: [number | "auto" | "dataMin" | "dataMax", number | "auto" | "dataMin" | "dataMax"];
  /** Marks every point; for sparse series such as one point per audit. */
  showDots?: boolean;
  /** Caption of the accessible table view. */
  tableLabel: string;
  dateLabel: string;
  className?: string;
}

/**
 * Lines over time with the chart rules: 2 px lines, recessive grid, one y-axis, a legend for
 * two or more series (the title names a single one), a tooltip and the same data as a table.
 */
export function TimeSeriesChart({
  data,
  series,
  formatDate,
  formatValue,
  reversed = false,
  yDomain,
  showDots = false,
  tableLabel,
  dateLabel,
  className,
}: TimeSeriesChartProps) {
  const config = Object.fromEntries(
    series.map((entry) => [entry.key, { label: entry.label, color: entry.color }]),
  ) satisfies ChartConfig;

  return (
    <div className="space-y-3">
      <ChartContainer config={config} className={cn("aspect-auto h-60 w-full", className)}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
            reversed={reversed}
            domain={yDomain ?? ["auto", "auto"]}
            allowDecimals={false}
            tickFormatter={(value: number) => formatValue(value)}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatDate(String(value))}
                formatter={(value, name) => (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="text-muted-foreground">{config[String(name)]?.label}</span>
                    <span className="font-medium tabular-nums">
                      {typeof value === "number" ? formatValue(value) : "—"}
                    </span>
                  </div>
                )}
              />
            }
          />
          {series.length > 1 && <ChartLegend content={<ChartLegendContent />} itemSorter={null} />}
          {series.map((entry) => (
            <Line
              key={entry.key}
              dataKey={entry.key}
              type="monotone"
              stroke={`var(--color-${entry.key})`}
              strokeWidth={2}
              dot={showDots ? { r: 4, strokeWidth: 2, fill: "var(--card)" } : false}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ChartContainer>

      <details className="rounded-lg border text-sm">
        <summary className="cursor-pointer px-3 py-2 text-muted-foreground">{tableLabel}</summary>
        <div className="max-h-72 overflow-y-auto border-t">
          <table className="w-full text-left">
            <caption className="sr-only">{tableLabel}</caption>
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{dateLabel}</th>
                {series.map((entry) => (
                  <th key={entry.key} className="px-3 py-2 text-right font-medium">
                    {entry.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr key={point.date} className="border-t">
                  <td className="px-3 py-1.5">{formatDate(point.date)}</td>
                  {series.map((entry) => {
                    const value = point[entry.key];
                    return (
                      <td key={entry.key} className="px-3 py-1.5 text-right tabular-nums">
                        {typeof value === "number" ? formatValue(value) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
