"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { SortableHeader } from "@/components/ui/data-table";
import { TrendingUp, TrendingDown, Minus, Trash2 } from "lucide-react";

export type KeywordRow = {
  id: string;
  keyword: string;
  position: number | null;
  prevPosition: number | null;
  volume: number | null;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  difficulty: number | null;
  geoScore: number | null;
  source: string;
  trend: string;
};

const sourceLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  google_search_console: { label: "GSC", variant: "default" },
  serper: { label: "Serper", variant: "secondary" },
  manual: { label: "Manuel", variant: "outline" },
};

export function getKeywordColumns(onDelete?: (id: string) => void, onSelect?: (kw: KeywordRow) => void): ColumnDef<KeywordRow>[] {
  return [
    {
      accessorKey: "keyword",
      header: ({ column }) => <SortableHeader column={column}>Anahtar Kelime</SortableHeader>,
      cell: ({ row }) => {
        const source = sourceLabels[row.original.source] ?? sourceLabels.manual;
        return (
          <div className="flex items-center gap-2">
            <button
              className="font-medium text-sm text-left hover:text-primary hover:underline underline-offset-4 transition-colors"
              onClick={() => onSelect?.(row.original)}
            >
              {row.getValue("keyword")}
            </button>
            <Badge variant={source.variant} className="text-[9px] px-1.5 py-0">{source.label}</Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "position",
      header: ({ column }) => <SortableHeader column={column}>Sıra</SortableHeader>,
      cell: ({ row }) => {
        const pos = row.getValue("position") as number | null;
        const prev = row.original.prevPosition;
        if (!pos) return <span className="text-muted-foreground text-xs">—</span>;
        const diff = prev ? prev - pos : 0;
        return (
          <div className="flex items-center gap-1">
            <Badge variant={pos <= 3 ? "default" : pos <= 10 ? "secondary" : "outline"} className="text-[10px] tabular-nums">
              #{pos}
            </Badge>
            {diff !== 0 && (
              <span className={`text-[10px] tabular-nums ${diff > 0 ? "text-success" : "text-destructive"}`}>
                {diff > 0 ? `+${diff}` : diff}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "clicks",
      header: ({ column }) => <SortableHeader column={column}>Tıklama</SortableHeader>,
      cell: ({ row }) => {
        const clicks = row.getValue("clicks") as number | null;
        return <span className="text-sm tabular-nums text-muted-foreground">{clicks?.toLocaleString("tr-TR") ?? "—"}</span>;
      },
    },
    {
      accessorKey: "impressions",
      header: ({ column }) => <SortableHeader column={column}>Gösterim</SortableHeader>,
      cell: ({ row }) => {
        const imp = row.getValue("impressions") as number | null;
        return <span className="text-sm tabular-nums text-muted-foreground">{imp?.toLocaleString("tr-TR") ?? "—"}</span>;
      },
    },
    {
      accessorKey: "ctr",
      header: ({ column }) => <SortableHeader column={column}>CTR</SortableHeader>,
      cell: ({ row }) => {
        const ctr = row.getValue("ctr") as number | null;
        return <span className="text-sm tabular-nums text-muted-foreground">{ctr ? `%${ctr}` : "—"}</span>;
      },
    },
    {
      accessorKey: "trend",
      header: "Trend",
      cell: ({ row }) => {
        const trend = row.getValue("trend") as string;
        if (trend === "up") return <TrendingUp className="size-4 text-success" />;
        if (trend === "down") return <TrendingDown className="size-4 text-destructive" />;
        return <Minus className="size-4 text-muted-foreground" />;
      },
    },
    ...(onDelete
      ? [
          {
            id: "actions",
            cell: ({ row }: { row: { original: KeywordRow } }) => (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(row.original.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            ),
          } as ColumnDef<KeywordRow>,
        ]
      : []),
  ];
}
