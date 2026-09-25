"use client";

import type { AiVisibilitySummary, Locale } from "@seo-geo/contracts";
import { Swords } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { DeltaBadge } from "@/components/data/delta-badge";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/page-header";
import { BrandSwatch } from "@/components/projects/brand-swatch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { slotColor } from "@/lib/chart-colors";
import { computeDelta, formatDay, formatNumber, formatPercent } from "@/lib/format";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { brandName, PendingNotice, RangeToggle } from "./ai-summary-view";
import { PLATFORM_NAMES } from "./platforms";
import { useAiSummary, type AiDays } from "./queries";
import { LowSampleBadge, RateBar } from "./rate";

export function CompetitorsView() {
  const t = useTranslations("aiVisibility.competitors");
  const tp = useTranslations("pages.competitors");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canEdit = useCan("member");
  const [days, setDays] = useState<AiDays>(30);
  const summary = useAiSummary(project?.id ?? null, days);

  if (!project) return null;
  const data = summary.data;
  const settingsHref = `/${workspace.slug}/${project.slug}/settings`;
  const hasCompetitors = data?.brands.some((brand) => brand.kind === "COMPETITOR") ?? false;
  const hasRuns = (data?.overall[0]?.runs ?? 0) > 0;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={
          <>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link href={settingsHref} />}
              >
                {t("manage")}
              </Button>
            )}
            {hasCompetitors && hasRuns && <RangeToggle days={days} onChange={setDays} />}
          </>
        }
      />
      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : !hasCompetitors ? (
        <EmptyState icon={Swords} title={tp("emptyTitle")} description={tp("emptyBody")}>
          {canEdit && (
            <Button nativeButton={false} render={<Link href={settingsHref} />}>
              {t("add")}
            </Button>
          )}
        </EmptyState>
      ) : !hasRuns ? (
        <EmptyState icon={Swords} title={t("noAnswersTitle")} description={t("noAnswersBody")} />
      ) : (
        <>
          <PendingNotice count={data.pendingRuns} />
          <Card>
            <CardHeader>
              <CardTitle>{t("comparisonTitle")}</CardTitle>
              <CardDescription>{t("comparisonDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Comparison summary={data} locale={locale} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("shareTrendTitle")}</CardTitle>
              <CardDescription>{t("shareTrendDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ShareTrend summary={data} locale={locale} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("platformsTitle")}</CardTitle>
              <CardDescription>{t("platformsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <PlatformMatrix summary={data} locale={locale} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Comparison({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
  const t = useTranslations("aiVisibility.competitors");
  const tt = useTranslations("aiVisibility.table");
  const rows = summary.overall
    .map((stats) => ({ stats, brand: brandName(summary.brands, stats.entityId) }))
    .filter((row) => row.brand)
    .sort((a, b) => (b.stats.score ?? -1) - (a.stats.score ?? -1));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">{t("brand")}</TableHead>
          <TableHead className="text-right">{tt("score")}</TableHead>
          <TableHead>{tt("mentionRate")}</TableHead>
          <TableHead>{tt("citationRate")}</TableHead>
          <TableHead className="text-right">{tt("shareOfVoice")}</TableHead>
          <TableHead className="pr-6 text-right">{tt("averageRank")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ stats, brand }) => {
          const delta = computeDelta(stats.previous?.score ?? null, stats.score);
          const color = slotColor(brand?.colorSlot ?? 8);
          return (
            <TableRow key={stats.entityId}>
              <TableCell className="pl-6">
                <span className="flex items-center gap-2">
                  <BrandSwatch slot={brand?.colorSlot ?? 8} />
                  <span className="font-medium">{brand?.name}</span>
                  {brand?.kind === "OWN" && (
                    <Badge variant="outline" className="font-normal">
                      {t("you")}
                    </Badge>
                  )}
                  {stats.significantChange && (
                    <Badge variant="secondary" className="font-normal" title={t("significantHint")}>
                      {t("significant")}
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-2">
                  {delta && delta.amount > 0 && (
                    <DeltaBadge delta={delta} label={formatNumber(delta.amount, locale, 1, 1)} />
                  )}
                  <span className="font-medium">
                    {stats.score !== null ? formatNumber(stats.score, locale, 1, 1) : "—"}
                  </span>
                </span>
              </TableCell>
              <TableCell>
                <RateBar rate={stats.mentionRate} locale={locale} color={color} />
              </TableCell>
              <TableCell>
                <RateBar rate={stats.citationRate} locale={locale} color={color} />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {stats.shareOfVoice !== null ? formatPercent(stats.shareOfVoice, locale, 0) : "—"}
              </TableCell>
              <TableCell className="pr-6 text-right tabular-nums">
                {stats.averageRank !== null ? formatNumber(stats.averageRank, locale, 1, 1) : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Weekly share of voice per brand. */
function ShareTrend({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
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
          brands.map((brand) => {
            const share = week.brands.find(
              (entry) => entry.entityId === brand.entityId,
            )?.shareOfVoice;
            return [
              `b${brand.colorSlot}`,
              share === null || share === undefined ? null : share * 100,
            ];
          }),
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
      formatValue={(value) => formatPercent(value / 100, locale, 0)}
      tableLabel={t("tableView")}
      dateLabel={t("week")}
    />
  );
}

/** Mention rate of every brand on every platform. */
function PlatformMatrix({ summary, locale }: { summary: AiVisibilitySummary; locale: Locale }) {
  const t = useTranslations("aiVisibility.competitors");
  const platforms = summary.platforms.filter((platform) => platform.runs > 0);
  const brands = [...summary.brands].sort((a, b) => a.colorSlot - b.colorSlot);
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">{t("brand")}</TableHead>
            {platforms.map((platform) => (
              <TableHead key={platform.platform} className="text-right">
                <span className="inline-flex items-center gap-1.5">
                  {PLATFORM_NAMES[platform.platform]}
                  {platform.brands[0]?.lowSample && <LowSampleBadge runs={platform.runs} />}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {brands.map((brand) => (
            <TableRow key={brand.entityId}>
              <TableCell className="pl-6">
                <span className="flex items-center gap-2">
                  <BrandSwatch slot={brand.colorSlot} />
                  <span className="font-medium">{brand.name}</span>
                </span>
              </TableCell>
              {platforms.map((platform) => {
                const stats = platform.brands.find((entry) => entry.entityId === brand.entityId);
                const rate = stats?.mentionRate ?? null;
                return (
                  <TableCell key={platform.platform} className="text-right">
                    {rate ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-12 rounded-r-sm bg-muted" aria-hidden>
                          <span
                            className="block h-1.5 rounded-r-sm"
                            style={{
                              width: `${rate.value * 100}%`,
                              background: slotColor(brand.colorSlot),
                            }}
                          />
                        </span>
                        <span className="w-10 font-medium tabular-nums">
                          {formatPercent(rate.value, locale, 0)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
