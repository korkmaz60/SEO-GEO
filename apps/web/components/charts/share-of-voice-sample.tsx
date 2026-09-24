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

export interface SharePoint {
  week: string;
  own: number;
  competitor: number;
}

interface Props {
  data: SharePoint[];
  labels: {
    own: string;
    competitor: string;
    week: string;
    shareOfVoice: string;
    tableView: string;
  };
}

/**
 * Style-guide example of the chart rules: categorical slots 1 and 2 (own brand is always
 * slot 1), 2 px lines, a recessive grid, legend + tooltip, and the same data as a table.
 */
export function ShareOfVoiceSample({ data, labels }: Props) {
  const config = {
    own: { label: labels.own, color: "var(--chart-1)" },
    competitor: { label: labels.competitor, color: "var(--chart-2)" },
  } satisfies ChartConfig;

  return (
    <div className="space-y-4">
      <ChartContainer config={config} className="h-64 w-full">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.5} />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={32} domain={[0, 60]} unit="%" />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} itemSorter={null} />
          <Line
            dataKey="own"
            type="monotone"
            stroke="var(--color-own)"
            strokeWidth={2}
            dot={false}
          />
          <Line
            dataKey="competitor"
            type="monotone"
            stroke="var(--color-competitor)"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ChartContainer>

      <details className="rounded-lg border text-sm">
        <summary className="cursor-pointer px-3 py-2 text-muted-foreground">
          {labels.tableView}
        </summary>
        <table className="w-full border-t text-left">
          <caption className="sr-only">{labels.shareOfVoice}</caption>
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">{labels.week}</th>
              <th className="px-3 py-2 text-right font-medium">{labels.own}</th>
              <th className="px-3 py-2 text-right font-medium">{labels.competitor}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.week} className="border-t">
                <td className="px-3 py-1.5">{row.week}</td>
                <td className="px-3 py-1.5 text-right">{row.own}%</td>
                <td className="px-3 py-1.5 text-right">{row.competitor}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
