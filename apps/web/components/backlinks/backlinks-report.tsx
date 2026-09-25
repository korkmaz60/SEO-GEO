"use client";

import type { BacklinkHistoryPoint, Locale, ProjectBacklinks } from "@seo-geo/contracts";
import { Link2, Network, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { NewLostChart } from "@/components/charts/new-lost-chart";
import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { EmptyState } from "@/components/data/empty-state";
import { ExternalLinkIcon } from "@/components/data/external-link";
import { KpiTile } from "@/components/data/kpi-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { slotColor } from "@/lib/chart-colors";
import {
  formatCompact,
  formatDateTime,
  formatDay,
  formatMonth,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format";
import { useNow } from "@/lib/use-now";

/** Spam score bands of DataForSEO (0–100), shown as text. */
export function spamLevel(score: number): "low" | "medium" | "high" {
  return score < 30 ? "low" : score < 60 ? "medium" : "high";
}

/** The header, KPI row and charts of a project's backlink profile. */
export function BacklinksReport({
  report,
  actions,
}: {
  report: ProjectBacklinks;
  /** Shown beside when the data was fetched, e.g. the Refresh button. */
  actions?: ReactNode;
}) {
  const t = useTranslations("backlinks");
  const locale = useLocale() as Locale;
  const now = useNow();
  const fetchedAt = report.source.fetchedAt;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="truncate">{report.target}</span>
            <ExternalLinkIcon
              url={`https://${report.target}`}
              label={t("visit", { domain: report.target })}
            />
          </h2>
          <p className="text-sm text-muted-foreground">
            {report.includeSubdomains ? t("scopeSubdomains") : t("scopeHost")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-muted-foreground" title={formatDateTime(fetchedAt, locale)}>
            {report.costUsd > 0
              ? t("cost", { cost: formatUsd(report.costUsd, locale) })
              : t("fetched", { relative: formatRelativeTime(new Date(fetchedAt), locale, now) })}
          </p>
          {actions}
        </div>
      </div>

      <SummaryTiles report={report} />

      <div className="grid gap-4 lg:grid-cols-3">
        <HistoryCard history={report.history} />
        <NewLostCard report={report} />
      </div>
    </div>
  );
}

function SummaryTiles({ report }: { report: ProjectBacklinks }) {
  const t = useTranslations("backlinks.kpi");
  const ts = useTranslations("backlinks.spam");
  const locale = useLocale() as Locale;
  const { profile, newLost } = report;
  const days = newLost.length;
  const total = (
    key: "newReferringDomains" | "lostReferringDomains" | "newBacklinks" | "lostBacklinks",
  ) => newLost.reduce((sum, day) => sum + day[key], 0);

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label={t("rank")}
        icon={ShieldCheck}
        value={profile?.rank != null ? formatNumber(profile.rank, locale) : null}
        emptyLabel={t("noLinks")}
        detail={profile ? t("rankDetail") : null}
      />
      <KpiTile
        label={t("referringDomains")}
        icon={Network}
        value={profile ? formatNumber(profile.referringDomains, locale) : null}
        emptyLabel={t("noLinks")}
        detail={
          profile && profile.referringDomains > 0
            ? t("referringDomainsDetail", {
                main: formatNumber(profile.referringMainDomains, locale),
                share: formatPercent(
                  profile.referringDomainsNofollow / profile.referringDomains,
                  locale,
                  0,
                ),
              })
            : null
        }
      />
      <KpiTile
        label={t("backlinks")}
        icon={Link2}
        value={profile ? formatCompact(profile.backlinks, locale) : null}
        emptyLabel={t("noLinks")}
        detail={
          profile
            ? t("brokenDetail", { count: formatNumber(profile.brokenBacklinks, locale) })
            : null
        }
      />
      <KpiTile
        label={t("newDomains")}
        icon={TrendingUp}
        value={days > 0 ? formatNumber(total("newReferringDomains"), locale) : null}
        emptyLabel={t("noSeries")}
        detail={
          days > 0
            ? t("newDetail", { count: formatNumber(total("newBacklinks"), locale), days })
            : null
        }
      />
      <KpiTile
        label={t("lostDomains")}
        icon={TrendingDown}
        value={days > 0 ? formatNumber(total("lostReferringDomains"), locale) : null}
        emptyLabel={t("noSeries")}
        detail={
          days > 0
            ? t("lostDetail", { count: formatNumber(total("lostBacklinks"), locale), days })
            : null
        }
      />
      <KpiTile
        label={t("spamScore")}
        icon={ShieldAlert}
        value={profile?.spamScore != null ? formatNumber(profile.spamScore, locale) : null}
        emptyLabel={t("noLinks")}
        detail={
          profile?.spamScore != null
            ? t("spamDetail", { level: ts(spamLevel(profile.spamScore)) })
            : null
        }
      />
    </section>
  );
}

type HistoryMetric = "referringDomains" | "backlinks" | "rank";

/** Monthly referring domains, backlinks or rank: one measure at a time (one y-axis). */
function HistoryCard({ history }: { history: BacklinkHistoryPoint[] }) {
  const t = useTranslations("backlinks.history");
  const locale = useLocale() as Locale;
  const [metric, setMetric] = useState<HistoryMetric>("referringDomains");
  const data = history.map((point) => ({ date: point.month, [metric]: point[metric] }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[metric]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) setMetric(next as HistoryMetric);
          }}
          aria-label={t("metric")}
        >
          <ToggleGroupItem value="referringDomains">{t("show.referringDomains")}</ToggleGroupItem>
          <ToggleGroupItem value="backlinks">{t("show.backlinks")}</ToggleGroupItem>
          <ToggleGroupItem value="rank">{t("show.rank")}</ToggleGroupItem>
        </ToggleGroup>
        {data.length < 2 ? (
          <EmptyState
            icon={TrendingUp}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            size="compact"
          />
        ) : (
          <TimeSeriesChart
            data={data}
            series={[{ key: metric, label: t(metric), color: slotColor(1) }]}
            yDomain={metric === "rank" ? [0, 100] : [0, "auto"]}
            showDots
            formatDate={(month) => formatMonth(month, locale)}
            formatValue={(value) => formatNumber(value, locale)}
            formatTick={(value) => formatCompact(value, locale)}
            tableLabel={t("tableView")}
            dateLabel={t("month")}
          />
        )}
      </CardContent>
    </Card>
  );
}

type NewLostMetric = "referringDomains" | "backlinks";

/** Links gained and lost day by day, from DataForSEO's own series. */
function NewLostCard({ report }: { report: ProjectBacklinks }) {
  const t = useTranslations("backlinks.newLost");
  const locale = useLocale() as Locale;
  const [metric, setMetric] = useState<NewLostMetric>("referringDomains");
  const days = report.newLost;
  const data = days.map((day) =>
    metric === "referringDomains"
      ? { date: day.date, new: day.newReferringDomains, lost: day.lostReferringDomains }
      : { date: day.date, new: day.newBacklinks, lost: day.lostBacklinks },
  );
  const gained = data.reduce((sum, day) => sum + day.new, 0);
  const lost = data.reduce((sum, day) => sum + day.lost, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {days.length > 0
            ? t("description", {
                from: formatDay(days[0]?.date ?? "", locale),
                to: formatDay(days.at(-1)?.date ?? "", locale),
              })
            : t("descriptionEmpty")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ToggleGroup
          variant="outline"
          size="sm"
          value={[metric]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) setMetric(next as NewLostMetric);
          }}
          aria-label={t("metric")}
        >
          <ToggleGroupItem value="referringDomains">{t("referringDomains")}</ToggleGroupItem>
          <ToggleGroupItem value="backlinks">{t("backlinks")}</ToggleGroupItem>
        </ToggleGroup>
        {days.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            size="compact"
          />
        ) : (
          <>
            <p className="text-sm">
              {t("totals", {
                new: formatNumber(gained, locale),
                lost: formatNumber(lost, locale),
              })}
            </p>
            {gained === 0 && lost === 0 ? (
              <p className="text-sm text-muted-foreground">{t("none")}</p>
            ) : (
              <NewLostChart
                data={data}
                labels={{
                  new: t("new"),
                  lost: t("lost"),
                  date: t("day"),
                  tableView: t("tableView"),
                }}
                formatDate={(day) => formatDay(day, locale)}
                formatValue={(value) => formatNumber(value, locale)}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
