"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { Skeleton } from "@/components/ui/skeleton";

interface KeywordsData {
  keywords: {
    id: string;
    keyword: string;
    position: number | null;
    volume: number | null;
    difficulty: number | null;
    geoScore: number | null;
    trend: string;
    source: string;
    positionType?: string;
  }[];
}

export function TopKeywordsTable() {
  const { data, loading } = useApi<KeywordsData>("/api/keywords?filter=tracked");

  // Tracked keyword'lerden pozisyonu olanları en iyi sıralamaya göre göster
  const keywords = (data?.keywords ?? [])
    .filter((kw) => kw.position !== null && kw.position > 0)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 15);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Takip Edilen Kelimeler</CardTitle>
        <CardDescription>
          {keywords.length > 0 ? `Sıralama takibi yapılan ${keywords.length} kelime` : "Rank Tracker"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-5 w-8 rounded-full ml-auto" />
              </div>
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p className="text-sm">Henüz takip edilen kelime yok</p>
            <p className="text-xs mt-1">SEO → Organik Sorgular&apos;dan kelimeleri takibe alın veya manuel ekleyin</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Anahtar Kelime</TableHead>
                <TableHead className="text-xs text-center w-14">Sıra</TableHead>
                <TableHead className="text-xs text-center w-16">Hacim</TableHead>
                <TableHead className="text-xs text-center w-12">GEO</TableHead>
                <TableHead className="text-xs text-center w-10">Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keywords.map((kw) => (
                <TableRow key={kw.id}>
                  <TableCell className="font-medium text-sm py-2 max-w-[180px]">
                    <span className="truncate block">{kw.keyword}</span>
                    {kw.source === "google_search_console" && (
                      <span className="text-[9px] text-muted-foreground">GSC · ort. pozisyon</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <Badge
                      variant={kw.position! <= 3 ? "default" : kw.position! <= 10 ? "secondary" : "outline"}
                      className="text-[10px] tabular-nums min-w-[28px] justify-center"
                    >
                      #{kw.position}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center py-2 text-muted-foreground tabular-nums text-xs">
                    {kw.volume != null ? kw.volume.toLocaleString("tr-TR") : "—"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {kw.geoScore != null ? (
                      <span className={`text-xs font-semibold tabular-nums ${
                        kw.geoScore >= 80 ? "text-success" : kw.geoScore >= 60 ? "text-warning" : "text-destructive"
                      }`}>
                        {kw.geoScore}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {kw.trend === "up" ? <TrendingUp className="size-3.5 text-success mx-auto" /> :
                     kw.trend === "down" ? <TrendingDown className="size-3.5 text-destructive mx-auto" /> :
                     <Minus className="size-3.5 text-muted-foreground mx-auto" />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
