"use client";

import { AI_RANGES, type AiBrand, type AiVisibilitySummary, type Locale } from "@seo-geo/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  KeyRound,
  ListOrdered,
  MessageSquareText,
  Plus,
  Quote,
  RefreshCw,
  Settings2,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { EmptyState } from "@/components/data/empty-state";
import { KpiTile } from "@/components/data/kpi-tile";
import { PageHeader } from "@/components/page-header";
import { BrandSwatch } from "@/components/projects/brand-swatch";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiSend, errorMessage } from "@/lib/api";
import { slotColor } from "@/lib/chart-colors";
import { computeDelta, formatDay, formatNumber, formatPercent } from "@/lib/format";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { AddPromptsDialog } from "./add-prompts-dialog";
import { AiSettingsDialog } from "./ai-settings-dialog";
import { PLATFORM_NAMES } from "./platforms";
import { aiBase, useAiSummary, type AiDays } from "./queries";
import { LowSampleBadge, RateBar, formatRate } from "./rate";

type OverallStats = AiVisibilitySummary["overall"][number];

/** The range toggle shared by the AI visibility pages. */
export function RangeToggle({
  days,
  onChange,
}: {
  days: AiDays;
  onChange: (days: AiDays) => void;
}) {
  const t = useTranslations("aiVisibility");
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      value={[String(days)]}
      onValueChange={(value) => {
        const next = Number(value[0]);
        if (next) onChange(next as AiDays);
      }}
      aria-label={t("rangeLabel")}
    >
      {AI_RANGES.map((range) => (
        <ToggleGroupItem key={range} value={String(range)} className="tabular-nums">
          {t("range", { days: range })}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Actions and notices shared by the AI visibility pages. */
export function useAiActions(projectId: string | null) {
  const t = useTranslations("aiVisibility");
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend("POST", `${aiBase(workspace.id, projectId ?? "")}/run`),
    onSuccess: () => {
      toast.success(t("runQueued"));
      void queryClient.invalidateQueries({ queryKey: ["ai-visibility", projectId] });
    },
    onError: (error) => toast.error(errorMessage(error, t("runFailed"))),
  });
}

export function ProviderMissing() {
  const t = useTranslations("aiVisibility.providerMissing");
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  return (
    <Alert>
      <KeyRound aria-hidden />
      <AlertTitle>{t("title")}</AlertTitle>
      <AlertDescription>{t("body")}</AlertDescription>
      {isAdmin && (
        <AlertAction>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/${workspace.slug}/settings/providers`} />}
          >
            {t("action")}
          </Button>
        </AlertAction>
      )}
    </Alert>
  );
}

export function PendingNotice({ count }: { count: number }) {
  const t = useTranslations("aiVisibility");
  if (count === 0) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Clock className="size-4" aria-hidden />
      {t("pendingNotice", { count })}
    </p>
  );
}

export function brandName(brands: readonly AiBrand[], entityId: string): AiBrand | undefined {
  return brands.find((brand) => brand.entityId === entityId);
}

export function AiSummaryView() {
  const t = useTranslations("aiVisibility");
  const tp = useTranslations("pages.aiSummary");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canEdit = useCan("member");
  const [days, setDays] = useState<AiDays>(30);
  const [adding, setAdding] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const summary = useAiSummary(project?.id ?? null, days);
  const run = useAiActions(project?.id ?? null);

  if (!project) return null;
  const data = summary.data;
  const hasPrompts = (data?.prompts.total ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={
          canEdit &&
          data && (
            <>
              <Button variant="outline" size="sm" onClick={() => setConfiguring(true)}>
                <Settings2 />
                {t("settingsAction")}
              </Button>
              {hasPrompts && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.providerReady || run.isPending}
                  onClick={() => run.mutate()}
                >
                  <RefreshCw />
                  {t("runNow")}
                </Button>
              )}
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus />
                {t("addPrompts")}
              </Button>
            </>
          )
        }
      />

      {data && !data.providerReady && <ProviderMissing />}

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
          <Skeleton className="h-72 sm:col-span-3 xl:col-span-6" />
        </div>
      ) : !hasPrompts ? (
        <EmptyState icon={Sparkles} title={tp("emptyTitle")} description={tp("emptyBody")}>
          {canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus />
              {t("addPrompts")}
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SettingsLine summary={data} />
            <RangeToggle days={days} onChange={setDays} />
          </div>
          <PendingNotice count={data.pendingRuns} />
          <SummaryTiles summary={data} locale={locale} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("trendTitle")}</CardTitle>
                <CardDescription>{t("trendDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ScoreTrend summary={data} locale={locale} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("shareTitle")}</CardTitle>
                <CardDescription>{t("shareDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ShareOfVoice summary={data} locale={locale} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("platformsTitle")}</CardTitle>
              <CardDescription>{t("platformsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <PlatformTable summary={data} locale={locale} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("sourcesTitle")}</CardTitle>
              <CardDescription>{t("sourcesDescription")}</CardDescription>
              <CardAction>
                <Button
                  variant="ghost"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`/${workspace.slug}/${project.slug}/ai-visibility/sources`} />
                  }
                >
                  {t("allSources")}
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <TopSources summary={data} locale={locale} />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            {t("methodNote", { version: data.scoreVersion })}
          </p>
        </>
      )}

      <AddPromptsDialog project={project} open={adding} onOpenChange={setAdding} />
      {data && (
        <AiSettingsDialog
          key={JSON.stringify(data.settings)}
          projectId={project.id}
          settings={data.settings}
          providerReady={data.providerReady}
          open={configuring}
          onOpenChange={setConfiguring}
        />
      )}
    </div>
  );
}

function SettingsLine({ summary }: { summary: AiVisibilitySummary }) {
  const t = useTranslations("aiVisibility");
  const { settings } = summary;
  return (
    <p className="text-sm text-muted-foreground">
      {t("settingsLine", {
        frequency: settings.frequency,
        platforms: settings.platforms.length,
        samples: settings.samples,
        prompts: summary.prompts.active,
      })}
    </p>
  );
}

function ownStats(summary: AiVisibilitySummary): OverallStats | undefined {
  const own = summary.brands.find((brand) => brand.kind === "OWN");
  return summary.overall.find((entry) => entry.entityId === own?.entityId);
}

function SummaryTiles({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
  const t = useTranslations("aiVisibility.kpi");
  const ta = useTranslations("aiVisibility");
  const tc = useTranslations("common");
  const own = ownStats(summary);
  const hasRuns = (own?.runs ?? 0) > 0;
  const scoreDelta = own ? computeDelta(own.previous?.score ?? null, own.score) : null;
  const mentionDelta =
    own?.significantChange && own.previous?.mentionRate && own.mentionRate
      ? computeDelta(own.previous.mentionRate.value * 100, own.mentionRate.value * 100)
      : null;
  const interval = (rate: OverallStats["mentionRate"]) =>
    rate
      ? ta("interval", {
          low: formatPercent(rate.low, locale, 0),
          high: formatPercent(rate.high, locale, 0),
        })
      : null;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label={t("score")}
        icon={Sparkles}
        value={hasRuns && own?.score != null ? formatNumber(own.score, locale, 1) : null}
        emptyLabel={tc("noData")}
        delta={
          scoreDelta
            ? { delta: scoreDelta, label: formatNumber(scoreDelta.amount, locale, 1) }
            : null
        }
      />
      <KpiTile
        label={t("mentionRate")}
        icon={MessageSquareText}
        value={hasRuns ? formatRate(own?.mentionRate, locale) : null}
        emptyLabel={tc("noData")}
        detail={interval(own?.mentionRate ?? null)}
        delta={
          mentionDelta
            ? {
                delta: mentionDelta,
                label: tc("percentagePoints", {
                  value: formatNumber(mentionDelta.amount, locale, 0),
                }),
              }
            : null
        }
      />
      <KpiTile
        label={t("citationRate")}
        icon={Quote}
        value={hasRuns ? formatRate(own?.citationRate, locale) : null}
        emptyLabel={tc("noData")}
        detail={interval(own?.citationRate ?? null)}
      />
      <KpiTile
        label={t("shareOfVoice")}
        icon={Users}
        value={own?.shareOfVoice != null ? formatPercent(own.shareOfVoice, locale, 0) : null}
        emptyLabel={tc("noData")}
      />
      <KpiTile
        label={t("averageRank")}
        icon={ListOrdered}
        value={own?.averageRank != null ? formatNumber(own.averageRank, locale, 1) : null}
        emptyLabel={t("notMentioned")}
      />
      <KpiTile
        label={t("answers")}
        icon={Target}
        value={formatNumber(own?.runs ?? 0, locale)}
        emptyLabel={tc("noData")}
        detail={own?.lowSample ? ta("lowSampleHint", { runs: own.runs }) : null}
      />
    </section>
  );
}

/** Weekly AI visibility score of every brand; one line per brand in its slot color. */
export function ScoreTrend({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
  const t = useTranslations("aiVisibility");
  const weeks = summary.trend.filter((week) => week.runs > 0);
  if (weeks.length < 2) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("trendPending")}
      </p>
    );
  }
  const brands = [...summary.brands].sort((a, b) => a.colorSlot - b.colorSlot);
  return (
    <TimeSeriesChart
      data={weeks.map((week) => ({
        date: week.weekStart,
        ...Object.fromEntries(
          brands.map((brand) => [
            `b${brand.colorSlot}`,
            week.brands.find((entry) => entry.entityId === brand.entityId)?.score ?? null,
          ]),
        ),
      }))}
      series={brands.map((brand) => ({
        key: `b${brand.colorSlot}`,
        label: brand.name,
        color: slotColor(brand.colorSlot),
      }))}
      yDomain={[0, 100]}
      showDots={weeks.length < 8}
      formatDate={(day) => t("weekOf", { date: formatDay(day, locale) })}
      formatValue={(value) => formatNumber(value, locale, 1)}
      tableLabel={t("tableView")}
      dateLabel={t("week")}
    />
  );
}

/** Share of brand mentions among the tracked brands, in brand colors. */
function ShareOfVoice({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
  const t = useTranslations("aiVisibility");
  const entries = summary.overall
    .map((stats) => ({ stats, brand: brandName(summary.brands, stats.entityId) }))
    .filter((entry) => entry.brand)
    .sort((a, b) => (b.stats.shareOfVoice ?? 0) - (a.stats.shareOfVoice ?? 0));
  if (entries.every((entry) => entry.stats.shareOfVoice === null)) {
    return <p className="text-sm text-muted-foreground">{t("noMentions")}</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {entries.map(({ stats, brand }) => (
        <li
          key={stats.entityId}
          className="grid grid-cols-[minmax(5rem,9rem)_1fr_3rem] items-center gap-3 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <BrandSwatch slot={brand?.colorSlot ?? 8} />
            <span className="truncate font-medium">{brand?.name}</span>
          </span>
          <span className="h-3 rounded-r-sm bg-muted">
            <span
              className="block h-3 rounded-r-sm"
              style={{
                width: `${(stats.shareOfVoice ?? 0) * 100}%`,
                background: slotColor(brand?.colorSlot ?? 8),
              }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">
            {stats.shareOfVoice === null ? "—" : formatPercent(stats.shareOfVoice, locale, 0)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The own brand on each platform, with the uncertainty of every rate. */
function PlatformTable({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
  const t = useTranslations("aiVisibility.table");
  const own = summary.brands.find((brand) => brand.kind === "OWN");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">{t("platform")}</TableHead>
          <TableHead className="text-right">{t("answers")}</TableHead>
          <TableHead>{t("mentionRate")}</TableHead>
          <TableHead>{t("citationRate")}</TableHead>
          <TableHead className="text-right">{t("shareOfVoice")}</TableHead>
          <TableHead className="text-right">{t("averageRank")}</TableHead>
          <TableHead className="pr-6 text-right">{t("score")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {summary.platforms.map((platform) => {
          const stats = platform.brands.find((entry) => entry.entityId === own?.entityId);
          const enabled = summary.settings.platforms.includes(platform.platform);
          return (
            <TableRow key={platform.platform}>
              <TableCell className="pl-6 font-medium">
                <span className="flex items-center gap-2">
                  {PLATFORM_NAMES[platform.platform]}
                  {!enabled && (
                    <span className="text-xs font-normal text-muted-foreground">{t("paused")}</span>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-2">
                  {stats?.lowSample && platform.runs > 0 && <LowSampleBadge runs={platform.runs} />}
                  {formatNumber(platform.runs, locale)}
                </span>
              </TableCell>
              <TableCell>
                <RateBar rate={stats?.mentionRate ?? null} locale={locale} />
              </TableCell>
              <TableCell>
                <RateBar rate={stats?.citationRate ?? null} locale={locale} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stats?.shareOfVoice != null ? formatPercent(stats.shareOfVoice, locale, 0) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stats?.averageRank != null ? formatNumber(stats.averageRank, locale, 1, 1) : "—"}
              </TableCell>
              <TableCell className="pr-6 text-right font-medium tabular-nums">
                {stats?.score != null ? formatNumber(stats.score, locale, 1, 1) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Most cited domains; brand domains in the brand's color, others neutral. */
function TopSources({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
  const t = useTranslations("aiVisibility");
  if (summary.topSources.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noSources")}</p>;
  }
  const max = Math.max(...summary.topSources.map((source) => source.share));
  return (
    <ul className="flex flex-col gap-2.5">
      {summary.topSources.map((source) => {
        const brand = source.entityId ? brandName(summary.brands, source.entityId) : undefined;
        return (
          <li
            key={source.domain}
            className="grid grid-cols-[minmax(8rem,16rem)_1fr_5.5rem] items-center gap-3 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              {brand && <BrandSwatch slot={brand.colorSlot} />}
              <span className="truncate font-medium">{source.domain}</span>
            </span>
            <span className="h-2.5 rounded-r-sm bg-muted">
              <span
                className="block h-2.5 rounded-r-sm"
                style={{
                  width: `${(source.share / max) * 100}%`,
                  background: brand ? slotColor(brand.colorSlot) : "var(--muted-foreground)",
                  opacity: brand ? 1 : 0.55,
                }}
              />
            </span>
            <span className="text-right tabular-nums">
              <span className="font-medium">{formatPercent(source.share, locale, 0)}</span>
              <span className="ml-1.5 text-xs text-muted-foreground">
                {formatNumber(source.citations, locale)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
