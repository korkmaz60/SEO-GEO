"use client";

import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFeedback } from "@/hooks/use-feedback";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { formatLastUpdated } from "@/hooks/use-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { NoProject } from "@/components/dashboard/no-project";
import { useApi } from "@/hooks/use-api";
import {
  Sparkles, Loader2, CheckCircle2, Circle, RotateCcw,
  AlertTriangle, Zap, FileText, Globe, Gauge, Link2, Search, LayoutGrid,
  ChevronDown, ChevronUp, ArrowUpRight,
} from "lucide-react";

interface ActionItem {
  id: string;
  title: string;
  description: string;
  category: string;
  priority: string;
  impact: string | null;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
}

interface ActionData {
  items: ActionItem[];
  stats: {
    total: number;
    completed: number;
    pending: number;
    critical: number;
    high: number;
  };
}

const priorityConfig: Record<string, { label: string; color: string; order: number }> = {
  CRITICAL: { label: "Kritik", color: "bg-red-500/15 text-red-400 border-red-500/20", order: 0 },
  HIGH: { label: "Yüksek", color: "bg-orange-500/15 text-orange-400 border-orange-500/20", order: 1 },
  MEDIUM: { label: "Orta", color: "bg-blue-500/15 text-blue-400 border-blue-500/20", order: 2 },
  LOW: { label: "Düşük", color: "bg-zinc-500/15 text-zinc-400 border-zinc-500/20", order: 3 },
};

const categoryConfig: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  TECHNICAL_SEO: { label: "Teknik SEO", icon: AlertTriangle, color: "text-orange-400" },
  CONTENT: { label: "İçerik", icon: FileText, color: "text-blue-400" },
  GEO: { label: "GEO", icon: Globe, color: "text-emerald-400" },
  SPEED: { label: "Hız", icon: Gauge, color: "text-yellow-400" },
  BACKLINK: { label: "Backlink", icon: Link2, color: "text-purple-400" },
  KEYWORD: { label: "Anahtar Kelime", icon: Search, color: "text-cyan-400" },
  STRUCTURE: { label: "Yapı", icon: LayoutGrid, color: "text-pink-400" },
};

export default function ActionsPage() {
  const { data, loading, refetch, noProject, lastUpdated } = useApi<ActionData>("/api/action-items");
  const [generating, setGenerating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const { feedback, show: showFeedback, clear: clearFeedback } = useFeedback();

  async function generate() {
    setConfirmRegenerate(false);
    setGenerating(true);
    try {
      const res = await fetch("/api/action-items/generate", { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        const count = result.items?.length ?? result.count ?? 0;
        showFeedback("success", `AI analizi tamamlandı: ${count} aksiyon maddesi oluşturuldu.`);
        refetch();
      } else {
        const err = await res.json().catch(() => null);
        showFeedback("error", err?.error || "AI analizi başarısız oldu. AI sağlayıcı ayarlarını kontrol edin.");
      }
    } catch {
      showFeedback("error", "Bağlantı hatası.");
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerateClick() {
    if (items.length > 0 && stats.completed > 0) {
      setConfirmRegenerate(true);
    } else {
      generate();
    }
  }

  async function toggleItem(id: string, completed: boolean) {
    setToggling(id);
    try {
      await fetch("/api/action-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed }),
      });
      refetch();
    } finally {
      setToggling(null);
    }
  }

  const items = data?.items ?? [];
  const stats = data?.stats ?? { total: 0, completed: 0, pending: 0, critical: 0, high: 0 };

  const filteredItems = useMemo(() => {
    let filtered = items;
    if (filter === "pending") filtered = items.filter((i) => !i.completed);
    else if (filter === "completed") filtered = items.filter((i) => i.completed);
    else if (filter !== "all") filtered = items.filter((i) => i.category === filter);
    return filtered;
  }, [items, filter]);

  const progress = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  if (loading) return <PageSkeleton />;
  if (noProject) return <NoProject />;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-[1200px] mx-auto">
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={clearFeedback} />}

      {/* Regeneration Confirmation */}
      <Dialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mevcut Maddeler Silinecek</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">
              Şu anda <strong>{stats.total}</strong> maddeniz var ve bunlardan <strong>{stats.completed}</strong> tanesi tamamlanmış durumda.
              Yeniden analiz etmek tüm mevcut maddeleri silecek ve yenilerini oluşturacak.
            </p>
            <p className="text-sm text-muted-foreground">
              Bu işlem geri alınamaz. Devam etmek istiyor musunuz?
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmRegenerate(false)}>İptal</Button>
              <Button size="sm" variant="destructive" onClick={generate} className="gap-1.5">
                <RotateCcw className="size-3.5" />
                Evet, Yeniden Oluştur
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="size-6 text-primary" /> AI Yapılacaklar
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            AI tüm verilerinizi analiz edip size özel aksiyon planı oluşturur
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && <span className="text-[10px] text-muted-foreground">Son güncelleme: {formatLastUpdated(lastUpdated)}</span>}
          <Button onClick={handleGenerateClick} disabled={generating} className="gap-1.5">
            {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {generating ? "Analiz ediliyor..." : items.length > 0 ? "Yeniden Analiz Et" : "AI ile Oluştur"}
          </Button>
        </div>
      </div>

      {/* Empty State */}
      {items.length === 0 && !generating && (
        <Card className="border-dashed">
          <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-primary/10 p-5">
              <Sparkles className="size-10 text-primary" />
            </div>
            <div className="space-y-2 max-w-lg">
              <h3 className="font-semibold text-lg">Yapılacak Listenizi Oluşturun</h3>
              <p className="text-sm text-muted-foreground">
                AI, sitenizin SEO skorları, GEO puanları, teknik sorunlar, anahtar kelimeler,
                sayfa hızı ve rakip verilerini analiz ederek size özel bir aksiyon planı oluşturacak.
                Her madde için nasıl yapacağınıza dair detaylı bilgi verilecek.
              </p>
            </div>
            <Button onClick={handleGenerateClick} disabled={generating} size="lg" className="gap-2 mt-2">
              {generating ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
              {generating ? "Analiz ediliyor..." : "AI ile Analiz Başlat"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats & Progress */}
      {items.length > 0 && (
        <>
          <Card className="bg-gradient-to-r from-card via-card to-primary/5 border-primary/10">
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 space-y-2.5 w-full">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">İlerleme</span>
                    <span className="text-sm font-bold tabular-nums">{stats.completed}/{stats.total}</span>
                  </div>
                  <Progress value={progress} className="h-2.5" />
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>{stats.pending} bekliyor</span>
                    {stats.critical > 0 && <span className="text-red-400">{stats.critical} kritik</span>}
                    {stats.high > 0 && <span className="text-orange-400">{stats.high} yüksek öncelik</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold tabular-nums text-primary">%{progress}</p>
                  <p className="text-xs text-muted-foreground">Tamamlanan</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "all", label: `Tümü (${items.length})` },
              { key: "pending", label: `Bekleyen (${stats.pending})` },
              { key: "completed", label: `Tamamlanan (${stats.completed})` },
            ].map((f) => (
              <Button
                key={f.key}
                variant={filter === f.key ? "default" : "outline"}
                size="sm"
                className="text-xs h-7"
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </Button>
            ))}
            <span className="w-px h-7 bg-border mx-1" />
            {Object.entries(categoryConfig).map(([key, config]) => {
              const count = items.filter((i) => i.category === key && !i.completed).length;
              if (count === 0) return null;
              return (
                <Button
                  key={key}
                  variant={filter === key ? "default" : "outline"}
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => setFilter(filter === key ? "all" : key)}
                >
                  <config.icon className={`size-3 ${filter === key ? "" : config.color}`} />
                  {config.label} ({count})
                </Button>
              );
            })}
          </div>

          {/* Action Items */}
          <div className="space-y-2">
            {filteredItems.map((item) => {
              const priority = priorityConfig[item.priority] || priorityConfig.MEDIUM;
              const category = categoryConfig[item.category] || categoryConfig.TECHNICAL_SEO;
              const CategoryIcon = category.icon;
              const isExpanded = expandedId === item.id;
              const isToggling = toggling === item.id;

              return (
                <Card
                  key={item.id}
                  className={`transition-all ${item.completed ? "opacity-60" : "hover:border-primary/20"}`}
                >
                  <CardContent className="p-0">
                    {/* Header Row */}
                    <div className="flex items-start gap-3 p-4">
                      {/* Checkbox */}
                      <button
                        className="mt-0.5 shrink-0 transition-transform hover:scale-110"
                        onClick={() => toggleItem(item.id, !item.completed)}
                        disabled={isToggling}
                      >
                        {isToggling ? (
                          <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        ) : item.completed ? (
                          <CheckCircle2 className="size-5 text-emerald-500" />
                        ) : (
                          <Circle className="size-5 text-muted-foreground hover:text-primary" />
                        )}
                      </button>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-medium text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                            {item.title}
                          </span>
                          <Badge variant="outline" className={`text-[10px] ${priority.color}`}>
                            {priority.label}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] gap-1">
                            <CategoryIcon className={`size-2.5 ${category.color}`} />
                            {category.label}
                          </Badge>
                        </div>
                        {item.impact && (
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <ArrowUpRight className="size-3 text-emerald-400" />
                            {item.impact}
                          </p>
                        )}
                      </div>

                      {/* Expand Toggle */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-8 w-8 p-0"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      >
                        {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                      </Button>
                    </div>

                    {/* Expanded Description */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 ml-8 border-t border-border/50">
                        <div className="mt-3 rounded-lg bg-muted/50 p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                            Nasıl Yapılır?
                          </p>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">
                            {item.description}
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredItems.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500" />
                <p>Bu filtrede bekleyen madde yok.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
