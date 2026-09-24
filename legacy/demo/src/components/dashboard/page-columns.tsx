"use client";

import { type ColumnDef } from "@tanstack/react-table";
import { CheckCircle2, CircleSlash, SearchCheck, SearchSlash, Sparkles, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SortableHeader } from "@/components/ui/data-table";

export type SeoPageRow = {
  id: string;
  page: string;
  url: string;
  title: string | null;
  wordCount: number | null;
  source: string;
  indexed: boolean;
  lastCrawl: string | null;
  geoScore: number | null;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
  topQuery: string | null;
  topQueryClicks: number | null;
  topQueryPosition: number | null;
  visibility: string;
  visibilityLabel: string;
  visibilityRank: number;
  isSearchConsoleOnly: boolean;
};

const sourceLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  sitemap: { label: "Sitemap", variant: "secondary" },
  "internal-link": { label: "Internal", variant: "outline" },
  "search-console": { label: "GSC", variant: "default" },
  "robots-txt": { label: "Robots", variant: "outline" },
  "llms-txt": { label: "LLMs.txt", variant: "outline" },
  manual: { label: "Manual", variant: "outline" },
};

const visibilityConfig: Record<
  string,
  {
    icon: typeof TrendingUp;
    className: string;
  }
> = {
  "top-3": {
    icon: Sparkles,
    className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-400",
  },
  "top-10": {
    icon: TrendingUp,
    className: "border-blue-500/20 bg-blue-500/10 text-blue-400",
  },
  opportunity: {
    icon: SearchCheck,
    className: "border-amber-500/20 bg-amber-500/10 text-amber-400",
  },
  "low-visibility": {
    icon: SearchSlash,
    className: "border-orange-500/20 bg-orange-500/10 text-orange-400",
  },
  "indexed-hidden": {
    icon: CheckCircle2,
    className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-300",
  },
  "not-indexed": {
    icon: CircleSlash,
    className: "border-red-500/20 bg-red-500/10 text-red-400",
  },
};

export function getPageColumns(): ColumnDef<SeoPageRow>[] {
  return [
    {
      accessorKey: "page",
      header: ({ column }) => <SortableHeader column={column}>Sayfa</SortableHeader>,
      cell: ({ row }) => {
        const page = row.original;
        const source = sourceLabels[page.source] ?? sourceLabels.manual;

        return (
          <div className="min-w-[280px] space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium leading-tight">{page.title || page.url}</span>
              <Badge variant={source.variant} className="text-[9px] px-1.5 py-0">
                {source.label}
              </Badge>
              {page.isSearchConsoleOnly && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                  Yalnizca GSC
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{page.url}</p>
            <div className="flex flex-wrap items-center gap-1">
              {page.indexed ? (
                <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                  Indexli
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                  Index yok
                </Badge>
              )}
              {page.geoScore != null && (
                <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                  GEO {page.geoScore}
                </Badge>
              )}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "visibilityRank",
      header: ({ column }) => <SortableHeader column={column}>Gorunurluk</SortableHeader>,
      cell: ({ row }) => {
        const config = visibilityConfig[row.original.visibility] ?? visibilityConfig["low-visibility"];
        const Icon = config.icon;

        return (
          <Badge variant="outline" className={`gap-1 border ${config.className}`}>
            <Icon className="size-3" />
            {row.original.visibilityLabel}
          </Badge>
        );
      },
    },
    {
      accessorKey: "position",
      header: ({ column }) => <SortableHeader column={column}>Ort. Sira</SortableHeader>,
      cell: ({ row }) => {
        const position = row.original.position;
        if (position == null) return <span className="text-xs text-muted-foreground">-</span>;

        return (
          <Badge
            variant={position <= 3 ? "default" : position <= 10 ? "secondary" : "outline"}
            className="tabular-nums"
          >
            #{position}
          </Badge>
        );
      },
    },
    {
      accessorKey: "clicks",
      header: ({ column }) => <SortableHeader column={column}>Tiklama</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.original.clicks.toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      accessorKey: "impressions",
      header: ({ column }) => <SortableHeader column={column}>Gosterim</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.original.impressions.toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      accessorKey: "ctr",
      header: ({ column }) => <SortableHeader column={column}>CTR</SortableHeader>,
      cell: ({ row }) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {row.original.ctr != null ? `%${row.original.ctr}` : "-"}
        </span>
      ),
    },
    {
      accessorKey: "topQuery",
      header: ({ column }) => <SortableHeader column={column}>One Cikan Sorgu</SortableHeader>,
      cell: ({ row }) => {
        const query = row.original.topQuery;
        if (!query) return <span className="text-xs text-muted-foreground">-</span>;

        return (
          <div className="min-w-[180px]">
            <p className="truncate text-sm font-medium">{query}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.topQueryPosition != null ? `Ort. sira #${row.original.topQueryPosition}` : "Sorgu verisi"}
            </p>
          </div>
        );
      },
    },
  ];
}
