"use client";

import {
  AUDIT_RUNS_KEPT,
  ISSUE_CATALOG,
  SiteAuditOverviewSchema,
  isIssueCode,
  type AuditIssueSummary,
  type AuditRun,
  type AuditRunDetail,
  type IssueCategory,
  type Locale,
} from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileSearch,
  FileText,
  Info,
  Loader2,
  ScanSearch,
  TriangleAlert,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DeltaBadge } from "@/components/data/delta-badge";
import { EmptyState } from "@/components/data/empty-state";
import { KpiTile } from "@/components/data/kpi-tile";
import { ScoreRing } from "@/components/data/score-ring";
import { PageHeader } from "@/components/page-header";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet, apiSend } from "@/lib/api";
import { computeDelta, formatDateTime, formatDay, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { AuditPages } from "./audit-pages";
import { SeverityIcon } from "./issue-severity";
import { IssueSheet } from "./issue-sheet";
import { StartAuditDialog } from "./start-audit-dialog";

const CATEGORIES: IssueCategory[] = [
  "crawlability",
  "indexability",
  "content",
  "links",
  "performance",
  "structured_data",
  "ai_search",
];

export function SiteAuditView() {
  const t = useTranslations("siteAudit");
  const tp = useTranslations("pages.siteAudit");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canEdit = useCan("member");
  const queryClient = useQueryClient();
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: ["site-audit", project?.id],
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/projects/${project?.id}/site-audit`,
        SiteAuditOverviewSchema,
        { signal },
      ),
    enabled: project !== null,
    refetchInterval: (query) => (query.state.data?.active ? 3000 : false),
  });

  if (!project) return null;
  const data = overview.data;
  const latest = data?.latest ?? null;
  const active = data?.active ?? null;
  const lastFailed =
    data?.runs[0] && ["FAILED", "CANCELED"].includes(data.runs[0].status) ? data.runs[0] : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={
          canEdit && <StartAuditDialog project={project} disabled={!data || active !== null} />
        }
      />

      {active && (
        <ActiveRun
          run={active}
          canEdit={canEdit}
          onCancel={async () => {
            await apiSend(
              "POST",
              `/workspaces/${workspace.id}/projects/${project.id}/site-audit/runs/${active.id}/cancel`,
            );
            toast.success(t("active.canceled"));
            await queryClient.invalidateQueries({ queryKey: ["site-audit", project.id] });
          }}
        />
      )}
      {lastFailed && !active && (
        <p className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm">
          <CircleX className="size-4 text-critical" aria-hidden />
          {lastFailed.status === "CANCELED"
            ? t("lastCanceled")
            : t("lastFailed", { error: lastFailed.error ?? "" })}
        </p>
      )}

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : !latest ? (
        !active && (
          <EmptyState icon={ScanSearch} title={tp("emptyTitle")} description={tp("emptyBody")}>
            {canEdit && <StartAuditDialog project={project} disabled={false} />}
          </EmptyState>
        )
      ) : (
        <>
          <Summary run={latest} locale={locale} />
          <Tabs defaultValue="issues">
            <TabsList>
              <TabsTrigger value="issues">{t("tabs.issues")}</TabsTrigger>
              <TabsTrigger value="pages">{t("tabs.pages")}</TabsTrigger>
              <TabsTrigger value="history">{t("tabs.history")}</TabsTrigger>
            </TabsList>
            <TabsContent value="issues" className="mt-4">
              <IssueList run={latest} onOpen={setOpenIssue} />
            </TabsContent>
            <TabsContent value="pages" className="mt-4">
              <AuditPages projectId={project.id} runId={latest.id} />
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <History runs={data.runs} locale={locale} />
            </TabsContent>
          </Tabs>
          <IssueSheet
            projectId={project.id}
            runId={latest.id}
            code={openIssue}
            onClose={() => setOpenIssue(null)}
          />
        </>
      )}
    </div>
  );
}

function ActiveRun({
  run,
  canEdit,
  onCancel,
}: {
  run: AuditRun;
  canEdit: boolean;
  onCancel: () => Promise<void>;
}) {
  const t = useTranslations("siteAudit.active");
  const locale = useLocale() as Locale;
  const percent = Math.min(100, (run.pagesCrawled / run.maxPages) * 100);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          {run.status === "QUEUED" ? t("queued") : t("running")}
        </CardTitle>
        <CardDescription>
          {t("progress", {
            pages: formatNumber(run.pagesCrawled, locale),
            max: formatNumber(run.maxPages, locale),
            url: run.startUrl,
          })}
        </CardDescription>
        {canEdit && (
          <CardAction>
            <ConfirmDialog
              trigger={
                <Button variant="outline" size="sm">
                  {t("cancel")}
                </Button>
              }
              title={t("cancelTitle")}
              description={t("cancelDescription")}
              confirmLabel={t("cancel")}
              onConfirm={onCancel}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <Progress value={percent} aria-label={t("running")} />
      </CardContent>
    </Card>
  );
}

function Summary({ run, locale }: { run: AuditRunDetail; locale: Locale }) {
  const t = useTranslations("siteAudit");
  const tc = useTranslations("common");
  const stats = run.stats;
  const delta = run.previous ? computeDelta(run.previous.healthScore, run.healthScore) : null;
  const newIssues = run.issues.reduce((sum, issue) => sum + (issue.new ?? 0), 0);
  const fixedIssues = run.issues.reduce((sum, issue) => sum + (issue.fixed ?? 0), 0);
  const metric = (value: number | undefined) =>
    value === undefined ? null : formatNumber(value, locale);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>{t("health.title")}</CardTitle>
          <CardDescription>
            {t("health.lastRun", { date: formatDateTime(run.finishedAt ?? run.createdAt, locale) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3">
          <ScoreRing score={run.healthScore} label={t("health.label")} size={128} />
          {delta && run.previous && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <DeltaBadge delta={delta} label={formatNumber(delta.amount, locale)} />
              {t("health.sincePrevious", { score: run.previous.healthScore ?? "—" })}
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">{t("health.formula")}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:col-span-2 xl:grid-cols-3">
        <KpiTile
          label={t("kpi.crawled")}
          icon={FileSearch}
          value={metric(stats?.crawled ?? run.pagesCrawled)}
          emptyLabel={tc("noData")}
        />
        <KpiTile
          label={t("kpi.errors")}
          icon={CircleX}
          value={metric(stats?.pagesWithErrors)}
          emptyLabel={tc("noData")}
        />
        <KpiTile
          label={t("kpi.warnings")}
          icon={TriangleAlert}
          value={metric(stats?.pagesWithWarnings)}
          emptyLabel={tc("noData")}
        />
        <KpiTile
          label={t("kpi.indexable")}
          icon={FileText}
          value={metric(stats?.indexable)}
          emptyLabel={tc("noData")}
        />
        <KpiTile
          label={t("kpi.changes")}
          icon={CircleCheck}
          value={
            run.previous
              ? t("kpi.changesValue", {
                  fixed: formatNumber(fixedIssues, locale),
                  new: formatNumber(newIssues, locale),
                })
              : null
          }
          emptyLabel={t("kpi.firstRun")}
        />
        <AiReadiness run={run} locale={locale} />
        {stats && (
          <Card className="col-span-2 gap-3 p-4 xl:col-span-3">
            <StatusBar stats={stats} locale={locale} />
          </Card>
        )}
      </div>
    </div>
  );
}

/** GEO: can AI search engines reach and read the site? */
function AiReadiness({ run, locale }: { run: AuditRunDetail; locale: Locale }) {
  const t = useTranslations("siteAudit.ai");
  const issueCount = (code: string) => run.issues.find((issue) => issue.code === code)?.count ?? 0;
  const indexable = run.stats?.indexable ?? 0;
  const coverage =
    indexable > 0 ? Math.max(0, 1 - issueCount("structured_data_missing") / indexable) : null;
  const checks = [
    {
      key: "searchCrawlers",
      ok: issueCount("ai_search_crawlers_blocked") === 0,
      label:
        issueCount("ai_search_crawlers_blocked") === 0 ? t("searchAllowed") : t("searchBlocked"),
    },
    {
      key: "llmsTxt",
      ok: issueCount("llms_txt_missing") === 0,
      label: issueCount("llms_txt_missing") === 0 ? t("llmsFound") : t("llmsMissing"),
    },
    {
      key: "structuredData",
      ok: coverage !== null && coverage >= 0.8 && issueCount("structured_data_invalid") === 0,
      label:
        coverage === null
          ? t("schemaUnknown")
          : t("schemaCoverage", { percent: formatPercent(coverage, locale, 0) }),
    },
  ];
  return (
    <Card className="gap-2 p-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Bot className="size-4" aria-hidden />
        {t("title")}
      </p>
      <ul className="space-y-1 text-sm">
        {checks.map((check) => (
          <li key={check.key} className="flex items-start gap-1.5">
            {check.ok ? (
              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
            ) : (
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            )}
            <span>
              <span className="sr-only">{check.ok ? t("ok") : t("attention")}: </span>
              {check.label}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const STATUS_SEGMENTS = [
  { key: "2xx", color: "var(--success)" },
  { key: "3xx", color: "var(--warning)" },
  { key: "4xx", color: "var(--serious)" },
  { key: "5xx", color: "var(--critical)" },
  { key: "failed", color: "var(--muted-foreground)" },
] as const;

function StatusBar({ stats, locale }: { stats: NonNullable<AuditRun["stats"]>; locale: Locale }) {
  const t = useTranslations("siteAudit.status");
  const total = Math.max(1, stats.crawled);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{t("title")}</p>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-sm"
        role="img"
        aria-label={t("title")}
      >
        {STATUS_SEGMENTS.map((segment) =>
          stats.status[segment.key] > 0 ? (
            <span
              key={segment.key}
              style={{
                width: `${(stats.status[segment.key] / total) * 100}%`,
                background: segment.color,
              }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {STATUS_SEGMENTS.map((segment) => (
          <li key={segment.key} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: segment.color }}
              aria-hidden
            />
            <span className="text-muted-foreground">{t(segment.key)}</span>
            <span className="font-medium tabular-nums">
              {formatNumber(stats.status[segment.key], locale)}
            </span>
          </li>
        ))}
        {stats.blocked > 0 && (
          <li className="text-muted-foreground">{t("blocked", { count: stats.blocked })}</li>
        )}
      </ul>
    </div>
  );
}

function IssueList({ run, onOpen }: { run: AuditRunDetail; onOpen: (code: string) => void }) {
  const t = useTranslations("siteAudit");
  const ti = useTranslations("siteAudit.issues");
  const locale = useLocale() as Locale;
  const [category, setCategory] = useState<"all" | IssueCategory>("all");
  const [showFixed, setShowFixed] = useState(false);
  const issues = run.issues.filter(
    (issue): issue is AuditIssueSummary & { code: keyof typeof ISSUE_CATALOG } =>
      isIssueCode(issue.code) &&
      (category === "all" || issue.category === category) &&
      (showFixed || issue.count > 0),
  );
  const categoryItems = [
    { value: "all", label: t("allCategories") },
    ...CATEGORIES.map((value) => ({ value, label: t(`categories.${value}`) })),
  ];
  const fixedOnly = run.issues.filter(
    (issue) => issue.count === 0 && (issue.fixed ?? 0) > 0,
  ).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          items={categoryItems}
          value={category}
          onValueChange={(value) => value && setCategory(value as "all" | IssueCategory)}
        >
          <SelectTrigger size="sm" aria-label={t("category")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categoryItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fixedOnly > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowFixed(!showFixed)}>
            {showFixed ? t("hideFixed") : t("showFixed", { count: fixedOnly })}
          </Button>
        )}
      </div>
      {issues.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("noIssues")}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {issues.map((issue) => (
            <li key={issue.code}>
              <button
                type="button"
                onClick={() => onOpen(issue.code)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
              >
                <SeverityIcon severity={issue.severity} />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm font-medium",
                      issue.count === 0 && "text-muted-foreground line-through",
                    )}
                  >
                    {ti(`${issue.code}.title`)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {t(`categories.${issue.category}`)}
                  </span>
                </span>
                {issue.new !== null && issue.new > 0 && (
                  <Badge variant="outline" className="shrink-0 border-critical/40 text-critical">
                    {t("newCount", { count: issue.new })}
                  </Badge>
                )}
                {issue.fixed !== null && issue.fixed > 0 && (
                  <Badge variant="outline" className="shrink-0 border-success/40 text-positive">
                    {t("fixedCount", { count: issue.fixed })}
                  </Badge>
                )}
                <span className="w-14 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {ISSUE_CATALOG[issue.code].scope === "site"
                    ? t("site")
                    : formatNumber(issue.count, locale)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function History({ runs, locale }: { runs: AuditRun[]; locale: Locale }) {
  const t = useTranslations("siteAudit.history");
  const completed = runs
    .filter((run) => run.status === "COMPLETED" && run.healthScore !== null)
    .reverse();
  return (
    <div className="flex flex-col gap-4">
      {completed.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("scoreTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart
              data={completed.map((run) => ({
                date: run.finishedAt ?? run.createdAt,
                score: run.healthScore,
              }))}
              series={[{ key: "score", label: t("score"), color: "var(--chart-1)" }]}
              yDomain={[0, 100]}
              showDots
              formatDate={(date) => formatDay(date.slice(0, 10), locale)}
              formatValue={(value) => formatNumber(value, locale)}
              tableLabel={t("table")}
              dateLabel={t("date")}
              className="h-48"
            />
          </CardContent>
        </Card>
      )}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("pages")}</TableHead>
              <TableHead className="text-right">{t("score")}</TableHead>
              <TableHead className="text-right">{t("errors")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((run) => (
              <TableRow key={run.id}>
                <TableCell>{formatDateTime(run.createdAt, locale)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{t(`statuses.${run.status}`)}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(run.pagesCrawled, locale)}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {run.healthScore ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {run.stats ? formatNumber(run.stats.pagesWithErrors, locale) : "—"}
                  {run.stats && run.stats.crawled > 0 && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      ({formatPercent(run.stats.pagesWithErrors / run.stats.crawled, locale)})
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Info className="size-3.5" aria-hidden />
        {t("retention", { count: AUDIT_RUNS_KEPT })}
      </p>
    </div>
  );
}
