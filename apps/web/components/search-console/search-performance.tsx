"use client";

import type { Locale, SearchConsoleData } from "@seo-geo/contracts";
import { ExternalLink, Eye, MousePointerClick, Percent, Search, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { DeltaBadge } from "@/components/data/delta-badge";
import { KpiTile, type MetricProvenance } from "@/components/data/kpi-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { slotColor } from "@/lib/chart-colors";
import {
  computeDelta,
  formatCompact,
  formatDay,
  formatNumber,
  formatPercent,
  type Delta,
} from "@/lib/format";

const METRICS = ["clicks", "impressions", "ctr", "position"] as const;
type Metric = (typeof METRICS)[number];
const VISIBLE_ROWS = 25;

/** Relative change for counts; `null` when the previous period has nothing to compare with. */
export function relativeChange(
  previous: number,
  current: number,
  locale: Locale,
): { delta: Delta; label: string } | null {
  if (previous <= 0) return null;
  const delta = computeDelta(previous, current);
  return delta ? { delta, label: formatPercent(delta.amount / previous, locale, 0) } : null;
}

/** A URL without its scheme and host, for tables where the domain is the project's. */
export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

export function SearchPerformance({
  data,
  locale,
  provenance,
}: {
  data: SearchConsoleData;
  locale: Locale;
  provenance: MetricProvenance & { labels: { source: string; method: string; updated: string } };
}) {
  const t = useTranslations("searchConsole.search");
  const tc = useTranslations("common");
  const [metric, setMetric] = useState<Metric>("clicks");
  const { totals, previous } = data;
  const ctrDelta = previous.impressions > 0 ? computeDelta(previous.ctr, totals.ctr) : null;
  const positionChange = computeDelta(previous.position, totals.position, { lowerIsBetter: true });
  // Changes below a tenth of a position round to zero; they are noise.
  const positionDelta = positionChange && positionChange.amount >= 0.05 ? positionChange : null;

  const format = (value: number, kind: Metric) =>
    kind === "ctr"
      ? formatPercent(value, locale)
      : kind === "position"
        ? formatNumber(value, locale, 1)
        : formatNumber(value, locale);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="gsc-heading">
      <h2 id="gsc-heading" className="text-base font-semibold">
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
          label={t("clicks")}
          icon={MousePointerClick}
          value={formatCompact(totals.clicks, locale)}
          emptyLabel={tc("noData")}
          delta={relativeChange(previous.clicks, totals.clicks, locale)}
          provenance={provenance}
        />
        <KpiTile
          label={t("impressions")}
          icon={Eye}
          value={formatCompact(totals.impressions, locale)}
          emptyLabel={tc("noData")}
          delta={relativeChange(previous.impressions, totals.impressions, locale)}
          provenance={provenance}
        />
        <KpiTile
          label={t("ctr")}
          icon={Percent}
          value={totals.impressions > 0 ? formatPercent(totals.ctr, locale) : null}
          emptyLabel={tc("noData")}
          delta={
            ctrDelta
              ? {
                  delta: ctrDelta,
                  label: tc("percentagePoints", {
                    value: formatNumber(ctrDelta.amount * 100, locale, 1),
                  }),
                }
              : null
          }
          provenance={provenance}
        />
        <KpiTile
          label={t("position")}
          icon={TrendingUp}
          value={totals.position !== null ? formatNumber(totals.position, locale, 1) : null}
          emptyLabel={tc("noData")}
          delta={
            positionDelta
              ? { delta: positionDelta, label: formatNumber(positionDelta.amount, locale, 1) }
              : null
          }
          provenance={provenance}
        />
      </div>

      <Card>
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
                  {t(`short.${entry}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardAction>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart
            data={data.daily.map((point) => ({
              date: point.date,
              value: metric === "position" ? point.position : point[metric],
            }))}
            series={[{ key: "value", label: t(metric), color: slotColor(1) }]}
            reversed={metric === "position"}
            yDomain={metric === "position" ? [1, "auto"] : [0, "auto"]}
            formatDate={(day) => formatDay(day, locale)}
            formatValue={(value) => format(value, metric)}
            tableLabel={t("tableView")}
            dateLabel={t("date")}
          />
        </CardContent>
      </Card>

      <Tabs defaultValue="queries">
        <TabsList>
          <TabsTrigger value="queries">{t("queries")}</TabsTrigger>
          <TabsTrigger value="pages">{t("pages")}</TabsTrigger>
        </TabsList>
        <TabsContent value="queries" className="mt-3">
          <RowsTable
            rows={data.queries.map((row) => ({
              ...row,
              key: row.query,
              label: row.query,
              href: null,
            }))}
            keyLabel={t("query")}
            locale={locale}
          />
        </TabsContent>
        <TabsContent value="pages" className="mt-3">
          <RowsTable
            rows={data.pages.map((row) => ({
              ...row,
              key: row.page,
              label: pathOf(row.page),
              href: row.page,
            }))}
            keyLabel={t("page")}
            locale={locale}
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

interface Row {
  key: string;
  label: string;
  href: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
  previousClicks: number | null;
  previousPosition: number | null;
}

function RowsTable({ rows, keyLabel, locale }: { rows: Row[]; keyLabel: string; locale: Locale }) {
  const t = useTranslations("searchConsole.search");
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const needle = filter.trim().toLocaleLowerCase(locale);
  const matching = needle
    ? rows.filter((row) => row.label.toLocaleLowerCase(locale).includes(needle))
    : rows;
  const visible = showAll ? matching : matching.slice(0, VISIBLE_ROWS);

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {t("noRows")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <InputGroup className="w-full sm:w-72">
        <InputGroupAddon>
          <Search aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("filter")}
          aria-label={t("filter")}
        />
      </InputGroup>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-64">{keyLabel}</TableHead>
              <TableHead className="text-right">{t("clicks")}</TableHead>
              <TableHead className="text-right">{t("change")}</TableHead>
              <TableHead className="text-right">{t("impressions")}</TableHead>
              <TableHead className="text-right">{t("ctr")}</TableHead>
              <TableHead className="text-right">{t("position")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => {
              const clicksDelta =
                row.previousClicks !== null ? computeDelta(row.previousClicks, row.clicks) : null;
              const positionDelta = computeDelta(row.previousPosition, row.position, {
                lowerIsBetter: true,
              });
              return (
                <TableRow key={row.key}>
                  <TableCell className="max-w-md">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-medium" title={row.key}>
                        {row.label}
                      </span>
                      {row.href && (
                        <a
                          href={row.href}
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
                    {formatNumber(row.clicks, locale)}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.previousClicks === null ? (
                      <Badge variant="outline">{t("new")}</Badge>
                    ) : clicksDelta ? (
                      <DeltaBadge
                        delta={clicksDelta}
                        label={formatNumber(clicksDelta.amount, locale)}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.impressions, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(row.ctr, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {row.position !== null ? formatNumber(row.position, locale, 1) : "—"}
                      {positionDelta && positionDelta.amount >= 0.1 && (
                        <DeltaBadge
                          delta={positionDelta}
                          label={formatNumber(positionDelta.amount, locale, 1)}
                        />
                      )}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {matching.length > VISIBLE_ROWS && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? t("showFewer") : t("showAll", { count: matching.length })}
        </Button>
      )}
    </div>
  );
}
