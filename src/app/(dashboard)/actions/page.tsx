"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  FileText,
  Gauge,
  Globe,
  LayoutGrid,
  Link2,
  Loader2,
  Radar,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Target,
  Zap,
} from "lucide-react";

import { NoProject } from "@/components/dashboard/no-project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FeedbackBanner } from "@/components/ui/feedback-banner";
import { PageSkeleton } from "@/components/ui/loading-skeleton";
import { Progress } from "@/components/ui/progress";
import { useApi, formatLastUpdated } from "@/hooks/use-api";
import { useFeedback } from "@/hooks/use-feedback";
import { cn } from "@/lib/utils";

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

interface CategoryStat {
  category: string;
  total: number;
  pending: number;
  completed: number;
}

interface PriorityStat {
  priority: string;
  total: number;
  pending: number;
}

interface ActionData {
  noProject?: boolean;
  items: ActionItem[];
  stats: {
    total: number;
    completed: number;
    pending: number;
    critical: number;
    high: number;
    completionRate: number;
    topCategories: CategoryStat[];
    byCategory: CategoryStat[];
    byPriority: PriorityStat[];
    generatedAt: string | null;
  };
}

interface ParsedDescription {
  finding: string;
  evidence: string[];
  how: string[];
  outcome: string;
}

type EnrichedActionItem = ActionItem & {
  parsed: ParsedDescription;
};

const priorityConfig: Record<string, { label: string; className: string; order: number }> = {
  CRITICAL: { label: "Kritik", className: "border-red-500/20 bg-red-500/10 text-red-400", order: 0 },
  HIGH: { label: "Yuksek", className: "border-amber-500/20 bg-amber-500/10 text-amber-400", order: 1 },
  MEDIUM: { label: "Orta", className: "border-blue-500/20 bg-blue-500/10 text-blue-400", order: 2 },
  LOW: { label: "Dusuk", className: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400", order: 3 },
};

const categoryConfig: Record<string, { label: string; icon: LucideIcon; className: string }> = {
  TECHNICAL_SEO: { label: "Teknik SEO", icon: ShieldAlert, className: "text-orange-400" },
  CONTENT: { label: "Icerik", icon: FileText, className: "text-blue-400" },
  GEO: { label: "GEO", icon: Globe, className: "text-emerald-400" },
  SPEED: { label: "Hiz", icon: Gauge, className: "text-yellow-400" },
  BACKLINK: { label: "Backlink", icon: Link2, className: "text-violet-400" },
  KEYWORD: { label: "Keyword", icon: Search, className: "text-cyan-400" },
  STRUCTURE: { label: "Yapi", icon: LayoutGrid, className: "text-pink-400" },
};

const defaultStats: ActionData["stats"] = {
  total: 0,
  completed: 0,
  pending: 0,
  critical: 0,
  high: 0,
  completionRate: 0,
  topCategories: [],
  byCategory: [],
  byPriority: [],
  generatedAt: null,
};

function extractSection(text: string, label: string, nextLabels: string[]) {
  const start = text.indexOf(label);
  if (start === -1) return "";

  const contentStart = start + label.length;
  const nextIndices = nextLabels
    .map((nextLabel) => text.indexOf(nextLabel, contentStart))
    .filter((index) => index !== -1);
  const end = nextIndices.length > 0 ? Math.min(...nextIndices) : text.length;

  return text.slice(contentStart, end).trim();
}

function cleanListLine(line: string) {
  return line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim();
}

function parseStructuredDescription(description: string): ParsedDescription {
  const normalized = description.replace(/\r\n/g, "\n");
  const finding =
    extractSection(normalized, "Sorun:", ["Kanit:", "Nasil yapilir:", "Beklenen sonuc:"]) ||
    normalized.trim();
  const evidenceBlock = extractSection(normalized, "Kanit:", ["Nasil yapilir:", "Beklenen sonuc:"]);
  const howBlock = extractSection(normalized, "Nasil yapilir:", ["Beklenen sonuc:"]);
  const outcome = extractSection(normalized, "Beklenen sonuc:", []) || "Beklenen sonuc tanimlanmamis.";

  return {
    finding,
    evidence: evidenceBlock
      ? evidenceBlock.split("\n").map(cleanListLine).filter(Boolean)
      : [],
    how: howBlock
      ? howBlock.split("\n").map(cleanListLine).filter(Boolean)
      : [],
    outcome,
  };
}

function formatGeneratedAt(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function SummaryCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "default" | "danger" | "warning" | "success";
}) {
  const toneClass =
    tone === "danger"
      ? "border-red-500/20 bg-red-500/5"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/5"
        : tone === "success"
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-border/70";

  return (
    <Card className={toneClass}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground">{helper}</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background/90 p-2.5">
            <Icon className="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailPanel({
  title,
  items,
  tone = "default",
}: {
  title: string;
  items: string[];
  tone?: "default" | "success";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        tone === "success" ? "border-emerald-500/20 bg-emerald-500/5" : "border-border/70 bg-muted/30",
      )}
    >
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-2 text-sm leading-6 text-muted-foreground">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current/60" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ActionsPage() {
  const { data, loading, error, refetch, noProject, lastUpdated } = useApi<ActionData>("/api/action-items");
  const [generating, setGenerating] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const { feedback, show: showFeedback, clear: clearFeedback } = useFeedback();

  const items = data?.items ?? [];
  const stats = data?.stats ?? defaultStats;
  const generatedAtLabel = formatGeneratedAt(stats.generatedAt);

  const orderedItems = useMemo<EnrichedActionItem[]>(() => {
    return [...items]
      .sort((left, right) => {
        if (left.completed !== right.completed) return Number(left.completed) - Number(right.completed);

        const priorityDiff =
          (priorityConfig[left.priority]?.order ?? priorityConfig.MEDIUM.order) -
          (priorityConfig[right.priority]?.order ?? priorityConfig.MEDIUM.order);
        if (priorityDiff !== 0) return priorityDiff;

        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      })
      .map((item) => ({
        ...item,
        parsed: parseStructuredDescription(item.description),
      }));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filter === "pending") return orderedItems.filter((item) => !item.completed);
    if (filter === "completed") return orderedItems.filter((item) => item.completed);
    if (filter === "critical") return orderedItems.filter((item) => !item.completed && item.priority === "CRITICAL");
    if (filter === "focus") {
      const topCategory = stats.topCategories[0]?.category;
      return topCategory ? orderedItems.filter((item) => item.category === topCategory && !item.completed) : orderedItems;
    }
    if (filter !== "all") return orderedItems.filter((item) => item.category === filter);
    return orderedItems;
  }, [filter, orderedItems, stats.topCategories]);

  const progress = stats.total > 0 ? stats.completionRate : 0;
  const topFocus = stats.topCategories[0];

  async function generate() {
    setConfirmRegenerate(false);
    setGenerating(true);

    try {
      const res = await fetch("/api/action-items/generate", { method: "POST" });
      const result = await res.json().catch(() => null);

      if (!res.ok) {
        showFeedback("error", result?.error || "AI action plan olusturulamadi.");
        return;
      }

      const count = result?.items?.length ?? result?.total ?? 0;
      const provider = result?.provider ? ` Kaynak: ${result.provider}.` : "";
      const fallbackMessage = result?.fallback
        ? " AI saglayicisi yerine deterministic analiz kullanildi."
        : "";
      showFeedback("success", `${count} aksiyon maddesi olusturuldu.${provider}${fallbackMessage}`);
      refetch();
    } catch {
      showFeedback("error", "Baglanti hatasi.");
    } finally {
      setGenerating(false);
    }
  }

  function handleGenerateClick() {
    if (items.length > 0 && stats.completed > 0) {
      setConfirmRegenerate(true);
      return;
    }

    generate();
  }

  async function toggleItem(id: string, completed: boolean) {
    setToggling(id);
    try {
      const res = await fetch("/api/action-items", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, completed }),
      });

      if (!res.ok) {
        const result = await res.json().catch(() => null);
        showFeedback("error", result?.error || "Aksiyon guncellenemedi.");
        return;
      }

      refetch();
    } catch {
      showFeedback("error", "Aksiyon guncellenirken baglanti hatasi olustu.");
    } finally {
      setToggling(null);
    }
  }

  if (loading) return <PageSkeleton />;
  if (noProject || data?.noProject) return <NoProject />;

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 p-4 sm:p-6">
      {feedback && <FeedbackBanner type={feedback.type} message={feedback.message} onClose={clearFeedback} />}
      {error && <FeedbackBanner type="error" message={error} />}

      <Dialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mevcut action plan sifirlanacak</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Su anda <strong>{stats.total}</strong> madde var ve bunlarin <strong>{stats.completed}</strong> tanesi
              tamamlandi. Yeniden analiz tum mevcut maddeleri siler ve yeni bir plan olusturur.
            </p>
            <p className="text-sm text-muted-foreground">Bu islem geri alinamaz.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmRegenerate(false)}>
                Iptal
              </Button>
              <Button size="sm" variant="destructive" onClick={generate} className="gap-1.5">
                <RotateCcw className="size-3.5" />
                Plani yenile
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-primary/10 bg-gradient-to-br from-card via-card to-primary/5">
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="rounded-xl border border-primary/15 bg-primary/10 p-2">
                  <Sparkles className="size-5 text-primary" />
                </div>
                <div>
                  <CardTitle>AI Action Plan</CardTitle>
                  <CardDescription>
                    Gorev listesi degil, bulgu ve kanita dayali optimizasyon backlogu.
                  </CardDescription>
                </div>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                Sistem SEO, GEO, crawl, page coverage, keyword ve authority sinyallerini birlestirip once neyin bozuk
                oldugunu, sonra nasil duzeltilecegini gosterir.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {lastUpdated && (
                <span className="text-[11px] text-muted-foreground">
                  Son yenileme: {formatLastUpdated(lastUpdated)}
                </span>
              )}
              <Button onClick={handleGenerateClick} disabled={generating} className="gap-1.5">
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {generating ? "Analiz ediliyor..." : items.length > 0 ? "Plani yenile" : "AI ile plan olustur"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ne bulur</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Kritik hata, zayif coverage, thin content, hiz ve otorite aciklari.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Nasil sunar</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Her maddede sorun, kanit, duzeltme plani ve beklenen sonuc ayri verilir.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Neye yarar</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sprint planlamasi, teknik SEO backlogu ve icerik onceliklendirmesi hizlanir.
                </p>
              </div>
            </div>

            {items.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Plan ilerlemesi</span>
                  <span className="tabular-nums text-muted-foreground">
                    {stats.completed}/{stats.total}
                  </span>
                </div>
                <Progress value={progress} className="h-2.5" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radar className="size-4 text-primary" />
              Analiz ozeti
            </CardTitle>
            <CardDescription>Bu sprintte en cok nerede acik var, tek bakista gor.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryCard
                title="Bekleyen"
                value={String(stats.pending)}
                helper="Henuz uygulanmayan madde"
                icon={Target}
              />
              <SummaryCard
                title="Kritik"
                value={String(stats.critical)}
                helper="Ilk sprintte kapanmali"
                icon={AlertTriangle}
                tone={stats.critical > 0 ? "danger" : "default"}
              />
            </div>

            <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Ana fokus alani</p>
                  <p className="mt-2 text-sm font-medium">
                    {topFocus ? categoryConfig[topFocus.category]?.label ?? topFocus.category : "Henuz olusmadi"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {topFocus
                      ? `${topFocus.pending} acik madde, ${topFocus.total} toplam bulgu.`
                      : "Plan olusturuldugunda en yogun kategori burada gorunur."}
                  </p>
                </div>
                {generatedAtLabel && (
                  <Badge variant="outline" className="border-border/70 bg-background/80">
                    {generatedAtLabel}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {stats.byPriority.map((entry) => {
                const config = priorityConfig[entry.priority] ?? priorityConfig.MEDIUM;
                const width = stats.total > 0 ? Math.max((entry.total / stats.total) * 100, entry.total > 0 ? 8 : 0) : 0;
                const indicatorClass =
                  entry.priority === "CRITICAL"
                    ? "bg-red-500"
                    : entry.priority === "HIGH"
                      ? "bg-amber-500"
                      : entry.priority === "MEDIUM"
                        ? "bg-blue-500"
                        : "bg-zinc-500";

                return (
                  <div key={entry.priority} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{config.label}</span>
                      <span className="text-muted-foreground">
                        {entry.pending} acik / {entry.total} toplam
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", indicatorClass)} style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {items.length === 0 && !generating ? (
        <Card className="border-dashed border-primary/20">
          <CardContent className="flex flex-col items-center gap-5 p-10 text-center">
            <div className="rounded-2xl border border-primary/15 bg-primary/10 p-5">
              <Sparkles className="size-10 text-primary" />
            </div>
            <div className="max-w-2xl space-y-2">
              <h2 className="text-xl font-semibold">Ilk action plan hazir degil</h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Bu alan profesyonel SEO workspace mantigiyla calisir. Ilk analizden sonra her madde sorun, kanit,
                duzeltme adimlari ve beklenen sonuc ile birlikte gelir.
              </p>
            </div>
            <Button onClick={handleGenerateClick} disabled={generating} size="lg" className="gap-2">
              {generating ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
              {generating ? "Analiz ediliyor..." : "AI ile ilk plani olustur"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {items.length > 0 && (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              title="Tamamlama"
              value={`%${progress}`}
              helper="Kapanan maddelerin orani"
              icon={CheckCircle2}
              tone={progress >= 60 ? "success" : "default"}
            />
            <SummaryCard
              title="Yuksek risk"
              value={String(stats.critical + stats.high)}
              helper="Kritik + yuksek oncelik"
              icon={Zap}
              tone={stats.critical + stats.high > 0 ? "warning" : "default"}
            />
            <SummaryCard
              title="Kategori"
              value={String(stats.byCategory.filter((entry) => entry.pending > 0).length)}
              helper="Aktif acik kategori"
              icon={LayoutGrid}
            />
            <SummaryCard
              title="Fokus"
              value={topFocus ? String(topFocus.pending) : "0"}
              helper={topFocus ? `${categoryConfig[topFocus.category]?.label ?? topFocus.category} backlogu` : "Henuz fokus yok"}
              icon={Radar}
            />
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-base font-semibold">Oncelik sirasi</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Liste once tamamlanmayan, sonra kritikligi yuksek maddeleri one alir.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "all", label: `Tumu (${items.length})` },
                  { key: "pending", label: `Acik (${stats.pending})` },
                  { key: "critical", label: `Kritik (${stats.critical})` },
                  { key: "focus", label: `Fokus (${topFocus?.pending ?? 0})` },
                  { key: "completed", label: `Tamamlanan (${stats.completed})` },
                ].map((entry) => (
                  <Button
                    key={entry.key}
                    variant={filter === entry.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setFilter(entry.key)}
                  >
                    {entry.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {stats.byCategory
                .filter((entry) => entry.total > 0)
                .map((entry) => {
                  const config = categoryConfig[entry.category] ?? categoryConfig.TECHNICAL_SEO;
                  const Icon = config.icon;
                  const isActive = filter === entry.category;

                  return (
                    <Button
                      key={entry.category}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => setFilter(isActive ? "all" : entry.category)}
                    >
                      <Icon className={cn("size-3.5", !isActive && config.className)} />
                      {config.label} ({entry.pending})
                    </Button>
                  );
                })}
            </div>
          </section>

          <section className="space-y-3">
            {filteredItems.map((item) => {
              const priority = priorityConfig[item.priority] ?? priorityConfig.MEDIUM;
              const category = categoryConfig[item.category] ?? categoryConfig.TECHNICAL_SEO;
              const CategoryIcon = category.icon;
              const isExpanded = expandedId === item.id;
              const isToggling = toggling === item.id;

              return (
                <Card
                  key={item.id}
                  className={cn(
                    "border-border/70 transition-all",
                    item.completed ? "bg-muted/20" : "hover:border-primary/20 hover:bg-primary/5",
                  )}
                >
                  <CardContent className="p-0">
                    <div className="flex gap-3 p-4 sm:p-5">
                      <button
                        className="mt-1 shrink-0 rounded-full transition-transform hover:scale-105"
                        onClick={() => toggleItem(item.id, !item.completed)}
                        disabled={isToggling}
                        aria-label={item.completed ? "Mark as pending" : "Mark as completed"}
                      >
                        {isToggling ? (
                          <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        ) : item.completed ? (
                          <CheckCircle2 className="size-5 text-emerald-500" />
                        ) : (
                          <Circle className="size-5 text-muted-foreground hover:text-primary" />
                        )}
                      </button>

                      <div className="min-w-0 flex-1 space-y-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className={priority.className}>
                                {priority.label}
                              </Badge>
                              <Badge variant="outline" className="gap-1.5 border-border/70 bg-background/80">
                                <CategoryIcon className={cn("size-3.5", category.className)} />
                                {category.label}
                              </Badge>
                              {item.impact && (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                                >
                                  <ArrowUpRight className="size-3.5" />
                                  {item.impact}
                                </Badge>
                              )}
                            </div>

                            <div className="space-y-2">
                              <h3
                                className={cn(
                                  "text-base font-semibold leading-7",
                                  item.completed && "text-muted-foreground line-through",
                                )}
                              >
                                {item.title}
                              </h3>
                              <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
                                {item.parsed.finding}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1">
                                {item.parsed.evidence.length} kanit
                              </span>
                              <span className="rounded-full border border-border/70 bg-muted/20 px-2.5 py-1">
                                {item.parsed.how.length} adim
                              </span>
                              {item.completedAt && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-400">
                                  Tamamlandi
                                </span>
                              )}
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
                          >
                            {isExpanded ? (
                              <>
                                Detayi gizle
                                <ChevronUp className="size-4" />
                              </>
                            ) : (
                              <>
                                Detayi ac
                                <ChevronDown className="size-4" />
                              </>
                            )}
                          </Button>
                        </div>

                        {isExpanded && (
                          <div className="grid gap-3 border-t border-border/60 pt-4 lg:grid-cols-2">
                            <DetailPanel title="Sorun" items={[item.parsed.finding]} />
                            <DetailPanel
                              title="Kanit"
                              items={
                                item.parsed.evidence.length > 0
                                  ? item.parsed.evidence
                                  : ["Bu bulgu icin ek kanit detayi kaydedilmemis."]
                              }
                            />
                            <DetailPanel
                              title="Duzeltme plani"
                              items={
                                item.parsed.how.length > 0
                                  ? item.parsed.how
                                  : ["Bu maddeyi ilgili sayfa veya modulde uygulayip tekrar test edin."]
                              }
                            />
                            <DetailPanel title="Beklenen sonuc" items={[item.parsed.outcome]} tone="success" />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          {filteredItems.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-10 text-center">
                <CheckCircle2 className="mx-auto mb-3 size-8 text-emerald-500" />
                <h3 className="text-base font-semibold">Bu filtrede acik madde yok</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Farkli bir kategori sec veya action plani yeniden uret.
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
