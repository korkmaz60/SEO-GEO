"use client";

import type { AnalyticsData, Locale } from "@seo-geo/contracts";
import { Bot, ExternalLink, Leaf, Target, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { DeltaBadge } from "@/components/data/delta-badge";
import { KpiTile, type MetricProvenance } from "@/components/data/kpi-tile";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { slotColor } from "@/lib/chart-colors";
import { computeDelta, formatCompact, formatDay, formatNumber, formatPercent } from "@/lib/format";

import { pathOf, relativeChange } from "./search-performance";

const METRICS = ["sessions", "organicSessions", "aiSessions"] as const;
type Metric = (typeof METRICS)[number];
const VISIBLE_ROWS = 25;

export function AnalyticsPerformance({
  data,
  locale,
  provenance,
}: {
  data: AnalyticsData;
  locale: Locale;
  provenance: MetricProvenance & { labels: { source: string; method: string; updated: string } };
}) {
  const t = useTranslations("searchConsole.analytics");
  const tc = useTranslations("common");
  const [metric, setMetric] = useState<Metric>("organicSessions");
  const { totals, previous } = data;
  const share = (part: number) =>
    totals.sessions > 0 ? formatPercent(part / totals.sessions, locale) : null;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="ga4-heading">
      <h2 id="ga4-heading" className="text-base font-semibold">
        {t("title")}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {t("range", {
            start: formatDay(data.range.start, locale),
            end: formatDay(data.range.end, locale),
          })}
        </span>
      </h2>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          label={t("sessions")}
          icon={Users}
          value={formatCompact(totals.sessions, locale)}
          emptyLabel={tc("noData")}
          delta={relativeChange(previous.sessions, totals.sessions, locale)}
          provenance={provenance}
        />
        <KpiTile
          label={t("organicShare", { share: share(totals.organicSessions) ?? "—" })}
          icon={Leaf}
          value={formatCompact(totals.organicSessions, locale)}
          emptyLabel={tc("noData")}
          delta={relativeChange(previous.organicSessions, totals.organicSessions, locale)}
          provenance={provenance}
        />
        <KpiTile
          label={t("aiShare", { share: share(totals.aiSessions) ?? "—" })}
          icon={Bot}
          value={formatNumber(totals.aiSessions, locale)}
          emptyLabel={tc("noData")}
          delta={relativeChange(previous.aiSessions, totals.aiSessions, locale)}
          provenance={provenance}
        />
        <KpiTile
          label={t("keyEvents")}
          icon={Target}
          value={formatNumber(totals.keyEvents, locale)}
          emptyLabel={tc("noData")}
          delta={relativeChange(previous.keyEvents, totals.keyEvents, locale)}
          provenance={provenance}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("chartTitle")}</CardTitle>
            <CardDescription>{t("chartDescription")}</CardDescription>
            <CardAction>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[metric]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next) setMetric(next as Metric);
                }}
                aria-label={t("metric")}
              >
                {METRICS.map((entry) => (
                  <ToggleGroupItem key={entry} value={entry}>
                    {t(`metrics.${entry}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </CardAction>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={data.daily.map((point) => ({ date: point.date, value: point[metric] }))}
              series={[{ key: "value", label: t(`metrics.${metric}`), color: slotColor(1) }]}
              yDomain={[0, "auto"]}
              formatDate={(day) => formatDay(day, locale)}
              formatValue={(value) => formatNumber(value, locale)}
              tableLabel={t("tableView")}
              dateLabel={t("date")}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("aiTitle")}</CardTitle>
            <CardDescription>{t("aiDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AiReferrals referrals={data.aiReferrals} locale={locale} />
          </CardContent>
        </Card>
      </div>

      <LandingPages pages={data.landingPages} locale={locale} />
    </section>
  );
}

/** Sessions per AI assistant; bar length encodes sessions in this period. */
function AiReferrals({
  referrals,
  locale,
}: {
  referrals: AnalyticsData["aiReferrals"];
  locale: Locale;
}) {
  const t = useTranslations("searchConsole.analytics");
  const visible = referrals.filter((entry) => entry.sessions > 0 || entry.previousSessions > 0);
  if (visible.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("aiEmpty")}</p>;
  }
  const max = Math.max(1, ...visible.map((entry) => entry.sessions));
  return (
    <ul className="flex flex-col gap-3" aria-label={t("aiTitle")}>
      {visible.map((entry) => {
        const delta = computeDelta(entry.previousSessions, entry.sessions);
        return (
          <li
            key={entry.name}
            className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate text-muted-foreground">{entry.name}</span>
            <span className="h-3 rounded-r-sm bg-muted">
              <span
                className="block h-full rounded-r-sm"
                style={{ width: `${(entry.sessions / max) * 100}%`, background: slotColor(1) }}
              />
            </span>
            <span className="flex items-center justify-end gap-1.5 tabular-nums">
              <span className="font-medium">{formatNumber(entry.sessions, locale)}</span>
              {delta && delta.trend !== "flat" && (
                <DeltaBadge delta={delta} label={formatNumber(delta.amount, locale)} />
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function LandingPages({ pages, locale }: { pages: AnalyticsData["landingPages"]; locale: Locale }) {
  const t = useTranslations("searchConsole.analytics");
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? pages : pages.slice(0, VISIBLE_ROWS);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("landingTitle")}</CardTitle>
        <CardDescription>{t("landingDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noRows")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-64">{t("page")}</TableHead>
                  <TableHead className="text-right">{t("metrics.sessions")}</TableHead>
                  <TableHead className="text-right">{t("metrics.organicSessions")}</TableHead>
                  <TableHead className="text-right">{t("engagementRate")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((row) => (
                  <TableRow key={row.page}>
                    <TableCell className="max-w-md">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium" title={row.page}>
                          {pathOf(row.page)}
                        </span>
                        {/^https?:\/\//.test(row.page) && (
                          <a
                            href={row.page}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label={t("openPage")}
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatNumber(row.sessions, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(row.organicSessions, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.sessions > 0
                        ? formatPercent(row.engagedSessions / row.sessions, locale, 0)
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {pages.length > VISIBLE_ROWS && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? t("showFewer") : t("showAll", { count: pages.length })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
