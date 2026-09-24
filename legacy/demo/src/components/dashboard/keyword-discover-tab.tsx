"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Plus, Sparkles, TrendingUp, Users, MessageSquare,
  Search, CheckCircle2, ArrowRight, Lightbulb, Zap,
} from "lucide-react";

interface Suggestion {
  keyword: string;
  source: "autocomplete" | "related" | "paa" | "competitor_gap";
  volume: number | null;
  difficulty: number | null;
  totalResults: number | null;
  opportunity: "high" | "medium" | "low";
  reason: string;
  lang: string;
}

interface OpportunitiesResponse {
  domain: string;
  seeds: string[];
  languages: string[];
  suggestions: Suggestion[];
  total: number;
  sources: {
    autocomplete: number;
    related: number;
    paa: number;
    competitor_gap: number;
  };
  byLang: Record<string, number>;
}

const langOptions = [
  { value: "tr", label: "Türkçe", flag: "TR" },
  { value: "en", label: "English", flag: "EN" },
  { value: "de", label: "Deutsch", flag: "DE" },
  { value: "fr", label: "Français", flag: "FR" },
  { value: "es", label: "Español", flag: "ES" },
];

const sourceConfig = {
  autocomplete: { label: "Trend", icon: TrendingUp, color: "text-emerald-500 bg-emerald-500/10" },
  related: { label: "İlişkili", icon: Search, color: "text-blue-500 bg-blue-500/10" },
  paa: { label: "Soru", icon: MessageSquare, color: "text-amber-500 bg-amber-500/10" },
  competitor_gap: { label: "Rakip Fırsatı", icon: Users, color: "text-purple-500 bg-purple-500/10" },
};

const opportunityConfig = {
  high: { label: "Yüksek Fırsat", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  medium: { label: "Orta Fırsat", color: "bg-amber-500/15 text-amber-400 border-amber-500/20" },
  low: { label: "Düşük Fırsat", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20" },
};

interface KeywordDiscoverTabProps {
  onKeywordAdded?: () => void;
}

export function KeywordDiscoverTab({ onKeywordAdded }: KeywordDiscoverTabProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [customSeed, setCustomSeed] = useState("");
  const [addedKeywords, setAddedKeywords] = useState<Set<string>>(new Set());
  const [addingKeyword, setAddingKeyword] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [langFilter, setLangFilter] = useState<string>("all");
  const [selectedLangs, setSelectedLangs] = useState<string[]>(["tr", "en"]);

  async function discover(seeds?: string[]) {
    setLoading(true);
    setData(null);
    setLangFilter("all");
    setFilter("all");
    try {
      const res = await fetch("/api/keywords/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seeds: seeds || [], languages: selectedLangs }),
      });
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } finally {
      setLoading(false);
    }
  }

  async function addKeyword(keyword: string) {
    setAddingKeyword(keyword);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      if (res.ok) {
        setAddedKeywords((prev) => new Set(prev).add(keyword.toLowerCase()));
        onKeywordAdded?.();
      }
    } finally {
      setAddingKeyword(null);
    }
  }

  async function addAllFiltered() {
    const toAdd = filteredSuggestions.filter(
      (s) => !addedKeywords.has(s.keyword.toLowerCase())
    );
    for (const s of toAdd.slice(0, 20)) {
      await addKeyword(s.keyword);
    }
  }

  const filteredSuggestions = data?.suggestions.filter((s) => {
    if (filter !== "all" && s.source !== filter) return false;
    if (langFilter !== "all" && s.lang !== langFilter) return false;
    return true;
  }) ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="bg-gradient-to-r from-card via-card to-primary/5 border-primary/10">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2">
                <Lightbulb className="size-5 text-primary" />
                <h3 className="font-semibold">Keyword Fırsatları</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Google Autocomplete, ilişkili aramalar, People Also Ask ve rakip analizinden
                sitenize trafik getirecek keyword fırsatlarını keşfedin.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {/* Dil Seçimi */}
              <div className="flex gap-1">
                {langOptions.map((lang) => (
                  <Button
                    key={lang.value}
                    variant={selectedLangs.includes(lang.value) ? "default" : "outline"}
                    size="sm"
                    className="text-xs px-2.5 h-8"
                    onClick={() => {
                      setSelectedLangs((prev) =>
                        prev.includes(lang.value)
                          ? prev.filter((l) => l !== lang.value)
                          : [...prev, lang.value]
                      );
                    }}
                  >
                    {lang.flag}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Özel seed keyword..."
                  value={customSeed}
                  onChange={(e) => setCustomSeed(e.target.value)}
                  className="sm:w-48"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customSeed.trim()) {
                      discover([customSeed.trim()]);
                    }
                  }}
                />
                <Button
                  onClick={() => discover(customSeed.trim() ? [customSeed.trim()] : [])}
                  disabled={loading || selectedLangs.length === 0}
                  className="gap-1.5 shrink-0"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {loading ? "Taranıyor..." : "Keşfet"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-3">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Google Autocomplete, Related Searches, PAA ve rakip siteleri taranıyor...
            </p>
          </CardContent>
        </Card>
      )}

      {data && !loading && (
        <>
          {/* Source Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { key: "autocomplete", label: "Trend Kelimeler", count: data.sources.autocomplete, icon: TrendingUp, desc: "Google Autocomplete" },
              { key: "related", label: "İlişkili Aramalar", count: data.sources.related, icon: Search, desc: "Related Searches" },
              { key: "paa", label: "Soru Bazlı", count: data.sources.paa, icon: MessageSquare, desc: "People Also Ask" },
              { key: "competitor_gap", label: "Rakip Fırsatları", count: data.sources.competitor_gap, icon: Users, desc: "Competitor Gap" },
            ].map((item) => (
              <Card
                key={item.key}
                className={`cursor-pointer transition-all hover:border-primary/30 ${filter === item.key ? "border-primary/50 bg-primary/5" : ""}`}
                onClick={() => setFilter(filter === item.key ? "all" : item.key)}
              >
                <CardContent className="p-4 text-center space-y-1">
                  <item.icon className="size-5 mx-auto text-muted-foreground" />
                  <p className="text-xl font-bold tabular-nums">{item.count}</p>
                  <p className="text-xs font-medium">{item.label}</p>
                  <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Language Filter */}
          {data.byLang && Object.keys(data.byLang).length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Dil:</span>
              <Button
                variant={langFilter === "all" ? "default" : "outline"}
                size="sm" className="text-xs h-7 px-2.5"
                onClick={() => setLangFilter("all")}
              >
                Tümü ({data.total})
              </Button>
              {Object.entries(data.byLang).map(([lang, count]) => (
                <Button
                  key={lang}
                  variant={langFilter === lang ? "default" : "outline"}
                  size="sm" className="text-xs h-7 px-2.5"
                  onClick={() => setLangFilter(langFilter === lang ? "all" : lang)}
                >
                  {langOptions.find((l) => l.value === lang)?.flag || lang.toUpperCase()} ({count})
                </Button>
              ))}
            </div>
          )}

          {/* Actions Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                {filteredSuggestions.length} öneri
                {filter !== "all" && ` (${sourceConfig[filter as keyof typeof sourceConfig]?.label})`}
                {langFilter !== "all" && ` — ${langOptions.find((l) => l.value === langFilter)?.label}`}
              </p>
              {(filter !== "all" || langFilter !== "all") && (
                <Button variant="ghost" size="sm" onClick={() => { setFilter("all"); setLangFilter("all"); }} className="text-xs h-7">
                  Filtreleri kaldır
                </Button>
              )}
            </div>
            {filteredSuggestions.length > 0 && (
              <Button variant="outline" size="sm" className="gap-1.5" onClick={addAllFiltered}>
                <Plus className="size-3.5" />
                Tümünü Ekle ({Math.min(filteredSuggestions.filter(s => !addedKeywords.has(s.keyword.toLowerCase())).length, 20)})
              </Button>
            )}
          </div>

          {/* Suggestion Cards */}
          <div className="space-y-2">
            {filteredSuggestions.map((suggestion) => {
              const source = sourceConfig[suggestion.source];
              const opp = opportunityConfig[suggestion.opportunity];
              const isAdded = addedKeywords.has(suggestion.keyword.toLowerCase());
              const isAdding = addingKeyword === suggestion.keyword;
              const SourceIcon = source.icon;

              return (
                <Card key={suggestion.keyword} className={`transition-all ${isAdded ? "opacity-60" : "hover:border-primary/20"}`}>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-3">
                      {/* Source Icon */}
                      <div className={`shrink-0 rounded-md p-2 ${source.color}`}>
                        <SourceIcon className="size-4" />
                      </div>

                      {/* Keyword Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{suggestion.keyword}</span>
                          <Badge variant="outline" className={`text-[10px] ${opp.color}`}>
                            {opp.label}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5">
                            {langOptions.find((l) => l.value === suggestion.lang)?.flag || suggestion.lang?.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {suggestion.reason}
                        </p>
                      </div>

                      {/* Metrics */}
                      <div className="hidden sm:flex items-center gap-4 shrink-0">
                        {suggestion.volume !== null && (
                          <div className="text-center">
                            <p className="text-sm font-semibold tabular-nums">{suggestion.volume.toLocaleString("tr-TR")}</p>
                            <p className="text-[10px] text-muted-foreground">Hacim</p>
                          </div>
                        )}
                        {suggestion.difficulty !== null && (
                          <div className="text-center">
                            <p className={`text-sm font-semibold tabular-nums ${suggestion.difficulty >= 70 ? "text-red-400" : suggestion.difficulty >= 40 ? "text-amber-400" : "text-emerald-400"}`}>
                              {suggestion.difficulty}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Zorluk</p>
                          </div>
                        )}
                      </div>

                      {/* Add Button */}
                      <Button
                        variant={isAdded ? "ghost" : "outline"}
                        size="sm"
                        className="shrink-0 gap-1.5"
                        disabled={isAdded || isAdding}
                        onClick={() => addKeyword(suggestion.keyword)}
                      >
                        {isAdding ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : isAdded ? (
                          <CheckCircle2 className="size-3.5 text-emerald-500" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        {isAdded ? "Eklendi" : "Ekle"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredSuggestions.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Search className="size-8 mx-auto mb-2 opacity-50" />
                <p>Bu filtrede öneri bulunamadı.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Empty State */}
      {!data && !loading && (
        <Card>
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-primary/10 p-4">
              <Zap className="size-8 text-primary" />
            </div>
            <div className="space-y-1.5 max-w-md">
              <h3 className="font-semibold text-lg">Trafik Fırsatlarını Keşfedin</h3>
              <p className="text-sm text-muted-foreground">
                "Keşfet" butonuna tıklayın — sitenizin içeriği, rakipleriniz ve Google trendleri
                analiz edilerek size en çok trafik getirecek anahtar kelimeler bulunacak.
              </p>
            </div>
            <Button onClick={() => discover()} className="gap-1.5 mt-2">
              <Sparkles className="size-4" />
              Otomatik Keşfet
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
