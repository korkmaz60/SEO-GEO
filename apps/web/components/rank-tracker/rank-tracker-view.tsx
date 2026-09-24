"use client";

import {
  RankTrackerDataSchema,
  type Locale,
  type RankTrackerSummary,
  type TrackedKeyword,
} from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { KpiTile } from "@/components/data/kpi-tile";
import { PageHeader } from "@/components/page-header";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { slotColor } from "@/lib/chart-colors";
import { computeDelta, formatCompact, formatDay, formatNumber, formatPercent } from "@/lib/format";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { AddKeywordsDialog } from "./add-keywords-dialog";
import { brandsOf } from "./brands";
import { KeywordDetailSheet } from "./keyword-detail-sheet";
import { KeywordTable } from "./keyword-table";

const RANGES = ["7", "30", "90"] as const;

export function RankTrackerView() {
  const t = useTranslations("rankTracker");
  const tp = useTranslations("pages.rankTracker");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canEdit = useCan("member");
  const isAdmin = useCan("admin");
  const queryClient = useQueryClient();
  const [days, setDays] = useState<(typeof RANGES)[number]>("30");
  const [adding, setAdding] = useState(false);
  const [openKeyword, setOpenKeyword] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const base = project ? `/workspaces/${workspace.id}/projects/${project.id}/rank-tracker` : "";

  const query = useQuery({
    queryKey: ["rank-tracker", project?.id, days],
    queryFn: ({ signal }) => apiGet(`${base}?days=${days}`, RankTrackerDataSchema, { signal }),
    enabled: project !== null,
    refetchInterval: (current) => (current.state.data?.summary.pendingChecks ? 15_000 : false),
  });
  const checkNow = useMutation({
    mutationFn: () => apiSend("POST", `${base}/check`),
    onSuccess: () => {
      toast.success(t("checkQueued"));
      void queryClient.invalidateQueries({ queryKey: ["rank-tracker", project?.id] });
    },
    onError: (error) => toast.error(errorMessage(error, t("checkFailed"))),
  });

  if (!project) return null;
  const data = query.data;
  const brands = data ? brandsOf(data.summary) : [];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={
          canEdit && (
            <>
              {data && data.summary.tracked > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!data.providerReady || checkNow.isPending}
                  onClick={() => checkNow.mutate()}
                >
                  <RefreshCw />
                  {t("checkNow")}
                </Button>
              )}
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus />
                {t("addKeywords")}
              </Button>
            </>
          )
        }
      />

      {data && !data.providerReady && (
        <Alert>
          <KeyRound aria-hidden />
          <AlertTitle>{t("providerMissing.title")}</AlertTitle>
          <AlertDescription>{t("providerMissing.body")}</AlertDescription>
          {isAdmin && (
            <AlertAction>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href={`/${workspace.slug}/settings/providers`} />}
              >
                {t("providerMissing.action")}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
          <Skeleton className="h-72 sm:col-span-3 xl:col-span-6" />
        </div>
      ) : data.summary.tracked === 0 ? (
        <EmptyState icon={TrendingUp} title={tp("emptyTitle")} description={tp("emptyBody")}>
          {canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus />
              {t("addKeywords")}
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          {data.summary.pendingChecks > 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="size-4" aria-hidden />
              {t("pendingNotice", { count: data.summary.pendingChecks })}
            </p>
          )}
          <SummaryTiles summary={data.summary} locale={locale} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t("visibilityTitle")}</CardTitle>
                <CardDescription>{t("visibilityDescription")}</CardDescription>
                <CardAction>
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    value={[days]}
                    onValueChange={(value) => {
                      const next = value[0];
                      if (next) setDays(next as (typeof RANGES)[number]);
                    }}
                    aria-label={t("rangeLabel")}
                  >
                    {RANGES.map((range) => (
                      <ToggleGroupItem key={range} value={range} className="tabular-nums">
                        {t(`range.${range}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </CardAction>
              </CardHeader>
              <CardContent>
                {data.summary.history.length < 2 ? (
                  <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                    {t("historyPending")}
                  </p>
                ) : (
                  <TimeSeriesChart
                    data={data.summary.history.map((point) => ({
                      date: point.date,
                      visibility: point.visibility,
                    }))}
                    series={[
                      { key: "visibility", label: t("kpi.visibility"), color: slotColor(1) },
                    ]}
                    yDomain={[0, "auto"]}
                    formatDate={(day) => formatDay(day, locale)}
                    formatValue={(value) => formatPercent(value / 100, locale)}
                    tableLabel={t("tableView")}
                    dateLabel={t("date")}
                  />
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t("distributionTitle")}</CardTitle>
                <CardDescription>{t("distributionDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <Distribution keywords={data.keywords} locale={locale} />
              </CardContent>
            </Card>
          </div>

          {brands.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("shareTitle")}</CardTitle>
                <CardDescription>{t("shareDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ShareOfVoice summary={data.summary} locale={locale} />
              </CardContent>
            </Card>
          )}

          <KeywordTable
            keywords={data.keywords}
            brands={brands}
            canEdit={canEdit}
            onOpen={setOpenKeyword}
            onDelete={setDeleting}
          />
        </>
      )}

      <AddKeywordsDialog project={project} open={adding} onOpenChange={setAdding} />
      <KeywordDetailSheet
        project={project}
        brands={brands}
        keywordId={openKeyword}
        canEdit={canEdit}
        onClose={() => setOpenKeyword(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTitle", { count: deleting?.length ?? 0 })}
        description={t("deleteDescription")}
        confirmLabel={t("deleteConfirm")}
        destructive
        onConfirm={async () => {
          await apiSend("POST", `${base}/keywords/delete`, { ids: deleting ?? [] });
          toast.success(t("deleted", { count: deleting?.length ?? 0 }));
          setDeleting(null);
          await queryClient.invalidateQueries({ queryKey: ["rank-tracker", project.id] });
        }}
      />
    </div>
  );
}

function SummaryTiles({ summary, locale }: { summary: RankTrackerSummary; locale: Locale }) {
  const t = useTranslations("rankTracker.kpi");
  const tc = useTranslations("common");
  const first = summary.history[0];
  const last = summary.history.at(-1);
  const visibilityDelta =
    first && last && summary.history.length > 1
      ? computeDelta(first.visibility, last.visibility)
      : null;
  const positionDelta =
    first && last && summary.history.length > 1
      ? computeDelta(first.averagePosition, last.averagePosition, { lowerIsBetter: true })
      : null;

  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label={t("visibility")}
        icon={Target}
        value={summary.checked > 0 ? formatPercent(summary.visibility / 100, locale) : null}
        emptyLabel={tc("noData")}
        delta={
          visibilityDelta
            ? {
                delta: visibilityDelta,
                label: tc("percentagePoints", {
                  value: formatNumber(visibilityDelta.amount, locale, 1),
                }),
              }
            : null
        }
      />
      <KpiTile
        label={t("traffic")}
        icon={Users}
        value={summary.checked > 0 ? formatCompact(summary.estimatedTraffic, locale) : null}
        emptyLabel={tc("noData")}
      />
      <KpiTile
        label={t("averagePosition")}
        icon={TrendingUp}
        value={
          summary.averagePosition !== null ? formatNumber(summary.averagePosition, locale, 1) : null
        }
        emptyLabel={tc("noData")}
        delta={
          positionDelta
            ? { delta: positionDelta, label: formatNumber(positionDelta.amount, locale, 1) }
            : null
        }
      />
      <KpiTile
        label={t("top3")}
        icon={Trophy}
        value={
          summary.checked > 0
            ? `${formatNumber(summary.top3, locale)} / ${formatNumber(summary.top10, locale)}`
            : null
        }
        emptyLabel={tc("noData")}
      />
      <KpiTile
        label={t("aiOverview")}
        icon={Sparkles}
        value={
          summary.checked > 0
            ? `${formatNumber(summary.aiOverviewCitations, locale)} / ${formatNumber(summary.aiOverviews, locale)}`
            : null
        }
        emptyLabel={tc("noData")}
      />
      <KpiTile
        label={t("keywords")}
        icon={Search}
        value={formatNumber(summary.tracked, locale)}
        emptyLabel={tc("noData")}
      />
    </section>
  );
}

const BUCKETS = [
  { key: "top3", test: (position: number | null) => position !== null && position <= 3 },
  {
    key: "top10",
    test: (position: number | null) => position !== null && position > 3 && position <= 10,
  },
  {
    key: "top20",
    test: (position: number | null) => position !== null && position > 10 && position <= 20,
  },
  { key: "top30", test: (position: number | null) => position !== null && position > 20 },
  { key: "none", test: (position: number | null) => position === null },
] as const;

/** How many checked keywords rank in each position band; bar length encodes the count. */
function Distribution({ keywords, locale }: { keywords: TrackedKeyword[]; locale: Locale }) {
  const t = useTranslations("rankTracker.buckets");
  const checked = keywords.filter((keyword) => keyword.latest !== null);
  const counts = BUCKETS.map((bucket) => ({
    key: bucket.key,
    count: checked.filter((keyword) => bucket.test(keyword.latest?.position ?? null)).length,
  }));
  const max = Math.max(1, ...counts.map((entry) => entry.count));
  return (
    <ul className="flex flex-col gap-3" aria-label={t("label")}>
      {counts.map((entry) => (
        <li
          key={entry.key}
          className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm"
        >
          <span className="text-muted-foreground">{t(entry.key)}</span>
          <span className="h-3 rounded-r-sm bg-muted">
            <span
              className="block h-3 rounded-r-sm"
              style={{
                width: `${(entry.count / max) * 100}%`,
                background: entry.key === "none" ? "var(--muted-foreground)" : "var(--chart-1)",
                opacity: entry.key === "none" ? 0.45 : 1,
              }}
            />
          </span>
          <span className="text-right font-medium tabular-nums">
            {formatNumber(entry.count, locale)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Visibility of the own site and each competitor over the same keywords, in brand colors. */
function ShareOfVoice({ summary, locale }: { summary: RankTrackerSummary; locale: Locale }) {
  const t = useTranslations("rankTracker");
  const entries = [...summary.shareOfVoice].sort((a, b) => b.visibility - a.visibility);
  const max = Math.max(1, ...entries.map((entry) => entry.visibility));
  return (
    <ul className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li
          key={entry.entityId}
          className="grid grid-cols-[minmax(6rem,12rem)_1fr_7rem] items-center gap-3 text-sm"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: slotColor(entry.colorSlot) }}
              aria-hidden
            />
            <span className="truncate font-medium">{entry.name}</span>
          </span>
          <span className="h-3 rounded-r-sm bg-muted">
            <span
              className="block h-3 rounded-r-sm"
              style={{
                width: `${(entry.visibility / max) * 100}%`,
                background: slotColor(entry.colorSlot),
              }}
            />
          </span>
          <span className="text-right tabular-nums">
            <span className="font-medium">{formatPercent(entry.visibility / 100, locale)}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              {t("rankingCount", { count: entry.ranking })}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
