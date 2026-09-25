"use client";

import type {
  BacklinkProfile,
  DomainCompetitor,
  DomainKeyword,
  DomainMetrics,
  DomainOverview,
  Locale,
  Project,
} from "@seo-geo/contracts";
import {
  ArrowRight,
  DollarSign,
  Link2,
  ListPlus,
  Network,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { EmptyState } from "@/components/data/empty-state";
import { ExternalLinkIcon } from "@/components/data/external-link";
import { KpiTile } from "@/components/data/kpi-tile";
import { SortHeader, compareValues, nextSort, type SortState } from "@/components/data/sort-header";
import { Difficulty, IntentBadge } from "@/components/keywords/keyword-metrics";
import { SaveToListDialog } from "@/components/keywords/save-to-list-dialog";
import { AddKeywordsDialog } from "@/components/rank-tracker/add-keywords-dialog";
import { ChangeCell } from "@/components/rank-tracker/keyword-table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import {
  computeDelta,
  formatCompact,
  formatDate,
  formatDateTime,
  formatMonth,
  formatNumber,
  formatPercent,
  formatUsd,
  formatUsdCompact,
} from "@/lib/format";
import { findMarket } from "@/lib/locations";
import { useCan, useWorkspace } from "@/lib/workspace-context";

interface DomainReportProps {
  overview: DomainOverview;
  /** Opens another domain (a competitor) in the same market. */
  onOpenDomain: (domain: string) => void;
}

/** The sections of a domain overview; the numbers are DataForSEO estimates, labeled as such. */
export function DomainReport({ overview, onOpenDomain }: DomainReportProps) {
  const t = useTranslations("domainOverview");
  const locale = useLocale() as Locale;
  const market = findMarket(overview.locationCode);
  const marketName = market ? market.names[locale] : String(overview.locationCode);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span className="truncate">{overview.domain}</span>
            <ExternalLinkIcon
              url={`https://${overview.domain}`}
              label={t("visit", { domain: overview.domain })}
            />
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("scope", { market: marketName, language: overview.languageCode })}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {overview.costUsd > 0
            ? t("cost", { cost: formatUsd(overview.costUsd, locale) })
            : t("fromCache", { date: formatDateTime(overview.sources.labs.fetchedAt, locale) })}
        </p>
      </div>

      <SummaryTiles overview={overview} />

      <div className="grid gap-4 lg:grid-cols-3">
        <HistoryCard overview={overview} />
        <PositionsCard organic={overview.organic} />
      </div>

      <KeywordsCard overview={overview} />

      <div className="grid gap-4 lg:grid-cols-3">
        <CompetitorsCard competitors={overview.competitors} onOpenDomain={onOpenDomain} />
        <BacklinksCard profile={overview.backlinks} />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("provenance", {
          market: marketName,
          labsDate: formatDateTime(overview.sources.labs.fetchedAt, locale),
          backlinksDate: formatDateTime(overview.sources.backlinks.fetchedAt, locale),
        })}
      </p>
    </div>
  );
}

function SummaryTiles({ overview }: { overview: DomainOverview }) {
  const t = useTranslations("domainOverview.kpi");
  const locale = useLocale() as Locale;
  const { organic, backlinks, history } = overview;
  const last = history.at(-1);
  const previous = history.at(-2);
  const keywordsDelta = previous && last ? computeDelta(previous.keywords, last.keywords) : null;
  const trafficDelta = previous && last ? computeDelta(previous.traffic, last.traffic) : null;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label={t("keywords")}
        icon={Search}
        value={organic ? formatNumber(organic.keywords, locale) : null}
        emptyLabel={t("noOrganic")}
        delta={
          keywordsDelta && keywordsDelta.amount > 0
            ? { delta: keywordsDelta, label: formatNumber(keywordsDelta.amount, locale) }
            : null
        }
        detail={
          organic
            ? t("keywordsDetail", {
                new: formatNumber(organic.newKeywords, locale),
                lost: formatNumber(organic.lostKeywords, locale),
              })
            : null
        }
      />
      <KpiTile
        label={t("traffic")}
        icon={Users}
        value={organic ? formatCompact(organic.traffic, locale) : null}
        emptyLabel={t("noOrganic")}
        delta={
          trafficDelta && trafficDelta.amount > 0 && previous && previous.traffic > 0
            ? {
                delta: trafficDelta,
                label: formatPercent(trafficDelta.amount / previous.traffic, locale, 0),
              }
            : null
        }
        detail={organic ? t("trafficDetail") : null}
      />
      <KpiTile
        label={t("trafficValue")}
        icon={DollarSign}
        value={organic ? formatUsdCompact(organic.trafficCostUsd, locale) : null}
        emptyLabel={t("noOrganic")}
        detail={organic ? t("trafficValueDetail") : null}
      />
      <KpiTile
        label={t("rank")}
        icon={ShieldCheck}
        value={backlinks?.rank != null ? formatNumber(backlinks.rank, locale) : null}
        emptyLabel={t("noBacklinks")}
        detail={backlinks ? t("rankDetail") : null}
      />
      <KpiTile
        label={t("referringDomains")}
        icon={Network}
        value={backlinks ? formatNumber(backlinks.referringDomains, locale) : null}
        emptyLabel={t("noBacklinks")}
        detail={
          backlinks && backlinks.referringDomains > 0
            ? t("nofollowShare", {
                share: formatPercent(
                  backlinks.referringDomainsNofollow / backlinks.referringDomains,
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
        value={backlinks ? formatCompact(backlinks.backlinks, locale) : null}
        emptyLabel={t("noBacklinks")}
        detail={
          backlinks
            ? t("brokenDetail", { count: formatNumber(backlinks.brokenBacklinks, locale) })
            : null
        }
      />
    </section>
  );
}

type HistoryMetric = "traffic" | "keywords";

/** Monthly traffic or keywords, one measure at a time (one y-axis). */
function HistoryCard({ overview }: { overview: DomainOverview }) {
  const t = useTranslations("domainOverview.history");
  const locale = useLocale() as Locale;
  const [metric, setMetric] = useState<HistoryMetric>("traffic");
  const data = overview.history.map((point) => ({
    date: point.month,
    traffic: Math.round(point.traffic),
    keywords: point.keywords,
    top10: point.top10,
  }));
  const series =
    metric === "traffic"
      ? [{ key: "traffic", label: t("traffic"), color: slotColor(1) }]
      : [
          { key: "keywords", label: t("keywords"), color: slotColor(1) },
          { key: "top10", label: t("top10"), color: slotColor(2) },
        ];

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        <CardAction>
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
            <ToggleGroupItem value="traffic">{t("traffic")}</ToggleGroupItem>
            <ToggleGroupItem value="keywords">{t("keywords")}</ToggleGroupItem>
          </ToggleGroup>
        </CardAction>
      </CardHeader>
      <CardContent>
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
            series={series}
            yDomain={[0, "auto"]}
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

const POSITION_GROUPS = [
  { label: "1", from: 1, to: 1 },
  { label: "2–3", from: 2, to: 3 },
  { label: "4–10", from: 4, to: 10 },
  { label: "11–20", from: 11, to: 20 },
  { label: "21–50", from: 21, to: 50 },
  { label: "51–100", from: 51, to: 100 },
] as const;

/** Keywords by the position of the domain's best result; bar length encodes the count. */
function PositionsCard({ organic }: { organic: DomainMetrics | null }) {
  const t = useTranslations("domainOverview.positions");
  const locale = useLocale() as Locale;
  const groups = POSITION_GROUPS.map((group) => ({
    ...group,
    count: (organic?.positions ?? [])
      .filter((bucket) => bucket.from >= group.from && bucket.to <= group.to)
      .reduce((sum, bucket) => sum + bucket.keywords, 0),
  }));
  const max = Math.max(1, ...groups.map((group) => group.count));
  const top10 = groups.slice(0, 3).reduce((sum, group) => sum + group.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!organic || organic.keywords === 0 ? (
          <EmptyState
            icon={Search}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            size="compact"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-3" aria-label={t("title")}>
              {groups.map((group) => (
                <li
                  key={group.label}
                  className="grid grid-cols-[3.5rem_1fr_3.5rem] items-center gap-3 text-sm"
                >
                  <span className="text-muted-foreground tabular-nums">{group.label}</span>
                  <span className="h-3 rounded-r-sm bg-muted">
                    <span
                      className="block h-3 rounded-r-sm"
                      style={{
                        width: `${(group.count / max) * 100}%`,
                        background: "var(--chart-1)",
                      }}
                    />
                  </span>
                  <span className="text-right font-medium tabular-nums">
                    {formatNumber(group.count, locale)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              {t("top10", {
                count: formatNumber(top10, locale),
                share: formatPercent(top10 / organic.keywords, locale),
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type KeywordSort = "keyword" | "position" | "change" | "volume" | "difficulty" | "traffic" | "cpc";

function sortValue(keyword: DomainKeyword, key: KeywordSort): number | string | null {
  switch (key) {
    case "keyword":
      return keyword.keyword;
    case "position":
      return keyword.position;
    case "change":
      return keyword.isNew ? null : keyword.change;
    case "volume":
      return keyword.searchVolume;
    case "difficulty":
      return keyword.keywordDifficulty;
    case "traffic":
      return keyword.traffic;
    case "cpc":
      return keyword.cpc;
  }
}

/** The path of a ranking URL, e.g. `/kahve-makineleri`, for a narrow column. */
function pathOf(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

/** The keywords with the most estimated traffic: sortable, selectable, trackable. */
function KeywordsCard({ overview }: { overview: DomainOverview }) {
  const t = useTranslations("domainOverview.keywords");
  const tk = useTranslations("keywordExplorer");
  const tt = useTranslations("rankTracker.table");
  const locale = useLocale() as Locale;
  const { projects } = useWorkspace();
  const canEdit = useCan("member");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<KeywordSort>>({ key: "traffic", direction: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trackIn, setTrackIn] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    return overview.topKeywords
      .filter((keyword) => !needle || keyword.keyword.includes(needle))
      .sort((a, b) =>
        compareValues(sortValue(a, sort.key), sortValue(b, sort.key), sort.direction, locale),
      );
  }, [overview.topKeywords, search, sort, locale]);
  const selectedKeywords = rows
    .filter((row) => selected.has(row.keyword))
    .map((row) => row.keyword);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.keyword));
  const header = (label: string, key: KeywordSort, className?: string) => (
    <SortHeader
      label={label}
      column={key}
      sort={sort}
      onSort={(column) =>
        setSort((previous) =>
          nextSort(previous, column, (next) =>
            next === "keyword" || next === "position" || next === "difficulty" ? 1 : -1,
          ),
        )
      }
      className={className}
    />
  );
  const market = { locationCode: overview.locationCode, languageCode: overview.languageCode };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>
          {overview.organic
            ? t("description", {
                shown: formatNumber(overview.topKeywords.length, locale),
                total: formatNumber(overview.organic.keywords, locale),
              })
            : t("descriptionEmpty")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {overview.topKeywords.length === 0 ? (
          <EmptyState
            icon={Search}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            size="compact"
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="w-full sm:w-64"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tk("filter")}
                aria-label={tk("filter")}
              />
              {canEdit && selectedKeywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-sm sm:ml-auto">
                  <span className="font-medium">
                    {tk("selected", { count: selectedKeywords.length })}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button size="sm" variant="outline" disabled={projects.length === 0} />
                      }
                    >
                      <TrendingUp />
                      {tk("track")}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>{tk("trackIn")}</DropdownMenuLabel>
                        {projects.map((candidate) => (
                          <DropdownMenuItem
                            key={candidate.id}
                            onClick={() => setTrackIn(candidate)}
                          >
                            {candidate.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="sm" variant="outline" onClick={() => setSaving(true)}>
                    <ListPlus />
                    {tk("saveToList")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                    {tk("clearSelection")}
                  </Button>
                </div>
              )}
            </div>
            <div className="max-h-[36rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    {canEdit && (
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={tt("selectPage")}
                          checked={allSelected}
                          onChange={() =>
                            setSelected(
                              allSelected ? new Set() : new Set(rows.map((row) => row.keyword)),
                            )
                          }
                        />
                      </TableHead>
                    )}
                    {header(t("columns.keyword"), "keyword", "min-w-52")}
                    {header(t("columns.position"), "position", "text-right")}
                    {header(t("columns.change"), "change")}
                    {header(t("columns.volume"), "volume", "text-right")}
                    {header(t("columns.traffic"), "traffic", "text-right")}
                    {header(t("columns.difficulty"), "difficulty")}
                    {header(t("columns.cpc"), "cpc", "text-right")}
                    <TableHead>{t("columns.intent")}</TableHead>
                    <TableHead className="min-w-40">{t("columns.url")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                        {tk("noResults")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row) => (
                      <TableRow key={row.keyword}>
                        {canEdit && (
                          <TableCell>
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              aria-label={tt("select", { keyword: row.keyword })}
                              checked={selected.has(row.keyword)}
                              onChange={() =>
                                setSelected((previous) => {
                                  const next = new Set(previous);
                                  if (next.has(row.keyword)) next.delete(row.keyword);
                                  else next.add(row.keyword);
                                  return next;
                                })
                              }
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{row.keyword}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {row.position}
                        </TableCell>
                        <TableCell>
                          <ChangeCell
                            change={
                              row.isNew
                                ? { from: null, to: row.position }
                                : row.change === null
                                  ? null
                                  : { from: row.position + row.change, to: row.position }
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.searchVolume !== null
                            ? formatCompact(row.searchVolume, locale)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.traffic !== null ? formatNumber(row.traffic, locale) : "—"}
                        </TableCell>
                        <TableCell>
                          <Difficulty value={row.keywordDifficulty} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.cpc !== null ? formatUsd(row.cpc, locale) : "—"}
                        </TableCell>
                        <TableCell>
                          <IntentBadge intent={row.intent} />
                        </TableCell>
                        <TableCell>
                          {row.url ? (
                            <span className="flex max-w-64 items-center gap-1.5">
                              <span className="truncate text-muted-foreground" title={row.url}>
                                {pathOf(row.url)}
                              </span>
                              <ExternalLinkIcon url={row.url} label={t("openUrl")} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      {trackIn && (
        <AddKeywordsDialog
          key={`${trackIn.id}-${selectedKeywords.join("|")}`}
          project={trackIn}
          open
          onOpenChange={(open) => !open && setTrackIn(null)}
          initialKeywords={selectedKeywords}
          market={market}
        />
      )}
      <SaveToListDialog
        open={saving}
        onOpenChange={setSaving}
        items={selectedKeywords.map((keyword) => ({ keyword, ...market }))}
        onSaved={() => setSelected(new Set())}
      />
    </Card>
  );
}

/** Domains that rank for the same keywords; opening one analyzes it in the same market. */
function CompetitorsCard({
  competitors,
  onOpenDomain,
}: {
  competitors: DomainCompetitor[];
  onOpenDomain: (domain: string) => void;
}) {
  const t = useTranslations("domainOverview.competitors");
  const locale = useLocale() as Locale;
  const max = Math.max(1, ...competitors.map((competitor) => competitor.commonKeywords));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {competitors.length === 0 ? (
          <EmptyState
            icon={Users}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            size="compact"
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">{t("columns.domain")}</TableHead>
                  <TableHead className="min-w-44">{t("columns.common")}</TableHead>
                  <TableHead className="text-right">{t("columns.avgPosition")}</TableHead>
                  <TableHead className="text-right">{t("columns.keywords")}</TableHead>
                  <TableHead className="text-right">{t("columns.traffic")}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((competitor) => (
                  <TableRow key={competitor.domain}>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="truncate font-medium hover:underline"
                          onClick={() => onOpenDomain(competitor.domain)}
                        >
                          {competitor.domain}
                        </button>
                        <ExternalLinkIcon
                          url={`https://${competitor.domain}`}
                          label={t("visit", { domain: competitor.domain })}
                        />
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="grid grid-cols-[1fr_3.5rem] items-center gap-2">
                        <span className="h-2 rounded-r-sm bg-muted">
                          <span
                            className="block h-2 rounded-r-sm"
                            style={{
                              width: `${(competitor.commonKeywords / max) * 100}%`,
                              background: "var(--chart-1)",
                            }}
                          />
                        </span>
                        <span className="text-right tabular-nums">
                          {formatNumber(competitor.commonKeywords, locale)}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {competitor.avgPosition !== null
                        ? formatNumber(competitor.avgPosition, locale, 1, 1)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {competitor.keywords !== null
                        ? formatNumber(competitor.keywords, locale)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {competitor.traffic !== null
                        ? formatCompact(competitor.traffic, locale)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => onOpenDomain(competitor.domain)}
                        aria-label={t("analyze", { domain: competitor.domain })}
                      >
                        <ArrowRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Spam score bands of DataForSEO (0–100), shown as text. */
function spamLevel(score: number): "low" | "medium" | "high" {
  return score < 30 ? "low" : score < 60 ? "medium" : "high";
}

function BacklinksCard({ profile }: { profile: BacklinkProfile | null }) {
  const t = useTranslations("domainOverview.backlinks");
  const locale = useLocale() as Locale;

  const rows: [label: string, value: string][] = profile
    ? [
        [t("rank"), profile.rank !== null ? `${formatNumber(profile.rank, locale)} / 100` : "—"],
        [t("backlinks"), formatNumber(profile.backlinks, locale)],
        [t("referringDomains"), formatNumber(profile.referringDomains, locale)],
        [t("referringMainDomains"), formatNumber(profile.referringMainDomains, locale)],
        [t("referringIps"), formatNumber(profile.referringIps, locale)],
        [
          t("nofollowDomains"),
          profile.referringDomains > 0
            ? formatPercent(profile.referringDomainsNofollow / profile.referringDomains, locale)
            : "—",
        ],
        [t("brokenBacklinks"), formatNumber(profile.brokenBacklinks, locale)],
        [
          t("spamScore"),
          profile.spamScore !== null
            ? `${formatNumber(profile.spamScore, locale)} · ${t(`spam.${spamLevel(profile.spamScore)}`)}`
            : "—",
        ],
        [t("firstSeen"), profile.firstSeen ? formatDate(profile.firstSeen, locale) : "—"],
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {!profile ? (
          <EmptyState
            icon={Link2}
            title={t("emptyTitle")}
            description={t("emptyBody")}
            size="compact"
          />
        ) : (
          <dl className="divide-y text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
