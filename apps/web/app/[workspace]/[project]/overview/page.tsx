import {
  AiVisibilitySummarySchema,
  PerformanceDataSchema,
  RankTrackerDataSchema,
  SiteAuditOverviewSchema,
  hasWorkspaceRole,
  isIssueCode,
  type AuditRunDetail,
  type Locale,
  type RankTrackerData,
  type SearchConsoleData,
} from "@seo-geo/contracts";
import {
  ArrowRight,
  BarChart3,
  Check,
  KeyRound,
  MessageSquareText,
  ScanSearch,
  Search,
  Sparkles,
  Swords,
  Tags,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { ScoreTrend } from "@/components/ai-visibility/ai-summary-view";
import { DeltaBadge } from "@/components/data/delta-badge";
import { EmptyState } from "@/components/data/empty-state";
import { KpiTile } from "@/components/data/kpi-tile";
import { ScoreRing } from "@/components/data/score-ring";
import { TrafficChart } from "@/components/overview/traffic-chart";
import { PageHeader } from "@/components/page-header";
import { BrandSwatch } from "@/components/projects/brand-swatch";
import { SeverityIcon } from "@/components/site-audit/issue-severity";
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
import { slotColor } from "@/lib/chart-colors";
import {
  computeDelta,
  formatCompact,
  formatDay,
  formatNumber,
  formatPercent,
  formatUsd,
} from "@/lib/format";
import { findMarket } from "@/lib/locations";
import { getCredentials, getProject, getUsage, getWorkspace, serverGet } from "@/lib/server/api";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[workspace]/[project]/overview">): Promise<Metadata> {
  const { workspace: workspaceSlug, project: projectSlug } = await params;
  const t = await getTranslations("pages.overview");
  const project = await getProject((await getWorkspace(workspaceSlug)).id, projectSlug);
  return { title: `${t("title")} · ${project.name}` };
}

interface SetupStep {
  key: "provider" | "brand" | "keywords" | "prompts" | "audit" | "gsc";
  icon: LucideIcon;
  done: boolean;
  /** Where to complete the step; hidden for people who cannot do it. */
  href?: string;
}

/** Panels fed by other modules show their empty state rather than failing the page. */
async function optional<T>(load: Promise<T>): Promise<T | null> {
  try {
    return await load;
  } catch {
    return null;
  }
}

const BUCKETS = [
  { key: "top3", test: (position: number) => position <= 3 },
  { key: "top10", test: (position: number) => position > 3 && position <= 10 },
  { key: "top20", test: (position: number) => position > 10 && position <= 20 },
  { key: "top30", test: (position: number) => position > 20 },
] as const;

export default async function OverviewPage({
  params,
}: PageProps<"/[workspace]/[project]/overview">) {
  const { workspace: workspaceSlug, project: projectSlug } = await params;
  const [t, locale, workspace] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getWorkspace(workspaceSlug),
  ]);
  const project = await getProject(workspace.id, projectSlug);
  const api = `/workspaces/${workspace.id}/projects/${project.id}`;
  const [credentials, usage, rank, audit, performance, ai] = await Promise.all([
    getCredentials(workspace.id),
    getUsage(workspace.id),
    optional(serverGet(`${api}/rank-tracker?days=30`, RankTrackerDataSchema)),
    optional(serverGet(`${api}/site-audit`, SiteAuditOverviewSchema)),
    optional(serverGet(`${api}/performance?days=28`, PerformanceDataSchema)),
    optional(serverGet(`${api}/ai-visibility?days=30`, AiVisibilitySummarySchema)),
  ]);
  const isAdmin = hasWorkspaceRole(workspace.role, "admin");
  const market = findMarket(project.locationCode);
  const base = `/${workspace.slug}/${project.slug}`;
  const summary = rank?.summary ?? null;
  const latestAudit = audit?.latest ?? null;

  const steps: SetupStep[] = [
    {
      key: "provider",
      icon: KeyRound,
      done: credentials.some(
        (credential) => credential.provider === "DATAFORSEO" && credential.status === "VALID",
      ),
      href: isAdmin ? `/${workspace.slug}/settings/providers` : undefined,
    },
    {
      key: "brand",
      icon: Tags,
      done: project.brands.some((brand) => brand.kind === "COMPETITOR"),
      href: `${base}/settings#brands`,
    },
    {
      key: "keywords",
      icon: Search,
      done: (summary?.tracked ?? 0) > 0,
      href: `${base}/rank-tracker`,
    },
    {
      key: "prompts",
      icon: MessageSquareText,
      done: (ai?.prompts.total ?? 0) > 0,
      href: `${base}/ai-visibility/prompts`,
    },
    {
      key: "audit",
      icon: ScanSearch,
      done: Boolean(audit && (audit.latest || audit.active)),
      href: `${base}/site-audit`,
    },
    {
      key: "gsc",
      icon: BarChart3,
      done: Boolean(performance?.integrations.gsc),
      href: `${base}/search-console`,
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  const setupDone = completed === steps.length;

  const brandVisibility = summary?.shareOfVoice ?? [];
  const totalVisibility = brandVisibility.reduce((sum, entry) => sum + entry.visibility, 0);
  const ownVisibility = brandVisibility.find((entry) => entry.kind === "OWN")?.visibility ?? 0;
  const shareOfVoice = totalVisibility > 0 ? ownVisibility / totalVisibility : null;
  const labels = {
    source: t("common.source"),
    method: t("common.method"),
    updated: t("common.updated"),
  };
  const ownBrand = ai?.brands.find((brand) => brand.kind === "OWN");
  const aiOwn = ai?.overall.find((entry) => entry.entityId === ownBrand?.entityId);
  const aiScore = aiOwn && aiOwn.runs > 0 ? aiOwn.score : null;
  const aiDelta = aiOwn ? computeDelta(aiOwn.previous?.score ?? null, aiOwn.score) : null;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={project.name}
        description={[
          project.domain,
          market ? market.names[locale] : null,
          t(`projectSettings.devices.${project.device}`),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`${base}/settings`} />}
          >
            {t("nav.items.projectSettings")}
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label={t("kpi.aiVisibility")}
          icon={Sparkles}
          value={aiScore !== null ? formatNumber(aiScore, locale, 1) : null}
          emptyLabel={
            (ai?.prompts.total ?? 0) > 0 ? t("overview.ai.collecting") : t("overview.ai.noPrompts")
          }
          delta={
            aiDelta ? { delta: aiDelta, label: formatNumber(aiDelta.amount, locale, 1) } : null
          }
          provenance={
            aiScore !== null && aiOwn
              ? {
                  source: t("overview.sources.aiVisibility"),
                  method: t("overview.ai.method", { runs: aiOwn.runs }),
                  labels,
                }
              : undefined
          }
        />
        <KpiTile
          label={t("kpi.shareOfVoice")}
          icon={Swords}
          value={shareOfVoice !== null ? formatPercent(shareOfVoice, locale) : null}
          emptyLabel={t("common.noData")}
          provenance={
            shareOfVoice !== null
              ? {
                  source: t("overview.sources.rankTracker"),
                  method: t("overview.shareMethod"),
                  labels,
                }
              : undefined
          }
        />
        <KpiTile
          label={t("kpi.avgPosition")}
          icon={TrendingUp}
          value={
            summary?.averagePosition != null
              ? formatNumber(summary.averagePosition, locale, 1)
              : null
          }
          emptyLabel={t("common.noData")}
        />
        <KpiTile
          label={t("kpi.trackedKeywords")}
          icon={Search}
          value={summary && summary.tracked > 0 ? formatNumber(summary.tracked, locale) : null}
          emptyLabel={t("common.noData")}
        />
        <KpiTile
          label={t("kpi.siteHealth")}
          icon={ScanSearch}
          value={latestAudit?.healthScore != null ? `${latestAudit.healthScore}/100` : null}
          emptyLabel={t("common.noData")}
          delta={
            latestAudit?.previous
              ? (() => {
                  const delta = computeDelta(
                    latestAudit.previous.healthScore,
                    latestAudit.healthScore,
                  );
                  return delta ? { delta, label: formatNumber(delta.amount, locale) } : null;
                })()
              : null
          }
        />
        <KpiTile
          label={t("kpi.spend")}
          icon={Wallet}
          value={formatUsd(usage.totalUsd, locale)}
          emptyLabel={t("common.noData")}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={setupDone ? "lg:col-span-3" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle>{t("overview.traffic.title")}</CardTitle>
            <CardDescription>
              {performance?.searchConsole
                ? t("overview.traffic.description", {
                    start: formatDay(performance.searchConsole.range.start, locale),
                    end: formatDay(performance.searchConsole.range.end, locale),
                  })
                : t("overview.traffic.source")}
            </CardDescription>
            {performance?.searchConsole && (
              <CardAction>
                <OpenLink href={`${base}/search-console`} label={t("overview.open")} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {performance?.searchConsole ? (
              <SearchSummary data={performance.searchConsole} locale={locale} />
            ) : (
              <EmptyState
                size="compact"
                icon={BarChart3}
                title={t("overview.traffic.emptyTitle")}
                description={t("overview.traffic.emptyBody")}
              >
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`${base}/search-console`} />}
                >
                  {t("overview.traffic.connect")}
                </Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>

        {!setupDone && (
          <Card>
            <CardHeader>
              <CardTitle>{t("onboarding.title")}</CardTitle>
              <CardDescription>{t("onboarding.description")}</CardDescription>
              <CardAction>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {t("onboarding.progress", { done: completed, total: steps.length })}
                </span>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {steps.map((step, index) => (
                  <li key={step.key} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                        step.done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {step.done ? (
                        <Check className="size-3.5" aria-label={t("onboarding.done")} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <step.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm",
                        step.done && "text-muted-foreground line-through",
                      )}
                    >
                      {t(`onboarding.steps.${step.key}`)}
                    </span>
                    {!step.done && step.href && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t(`onboarding.steps.${step.key}`)}
                        nativeButton={false}
                        render={<Link href={step.href} />}
                      >
                        <ArrowRight />
                      </Button>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("overview.rankTitle")}</CardTitle>
            {summary && summary.checked > 0 && (
              <>
                <CardDescription>
                  {t("overview.rankDescription", {
                    visibility: formatPercent(summary.visibility / 100, locale),
                    improved: summary.improved,
                    declined: summary.declined,
                  })}
                </CardDescription>
                <CardAction>
                  <OpenLink href={`${base}/rank-tracker`} label={t("overview.open")} />
                </CardAction>
              </>
            )}
          </CardHeader>
          <CardContent>
            {rank && summary && summary.checked > 0 ? (
              <RankDistribution rank={rank} locale={locale} />
            ) : (
              <EmptyState
                size="compact"
                icon={TrendingUp}
                title={t("overview.rankEmptyTitle")}
                description={t("overview.rankEmpty")}
              >
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`${base}/rank-tracker`} />}
                >
                  {t("overview.rankAction")}
                </Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("overview.siteHealth")}</CardTitle>
            {latestAudit && (
              <CardAction>
                <OpenLink href={`${base}/site-audit`} label={t("overview.open")} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {latestAudit ? (
              <AuditSummary run={latestAudit} locale={locale} />
            ) : (
              <EmptyState
                size="compact"
                icon={ScanSearch}
                title={t("overview.audit.emptyTitle")}
                description={
                  audit?.active ? t("overview.audit.running") : t("overview.audit.emptyBody")
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`${base}/site-audit`} />}
                >
                  {t("overview.audit.action")}
                </Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("overview.aiTrendTitle")}</CardTitle>
            {ai && aiOwn && aiOwn.runs > 0 && (
              <>
                <CardDescription>
                  {t("overview.ai.description", {
                    mentioned: formatPercent(aiOwn.mentionRate?.value ?? 0, locale, 0),
                    cited: formatPercent(aiOwn.citationRate?.value ?? 0, locale, 0),
                    runs: aiOwn.runs,
                  })}
                </CardDescription>
                <CardAction>
                  <OpenLink href={`${base}/ai-visibility`} label={t("overview.open")} />
                </CardAction>
              </>
            )}
          </CardHeader>
          <CardContent>
            {ai && aiOwn && aiOwn.runs > 0 ? (
              <ScoreTrend summary={ai} locale={locale} />
            ) : (
              <EmptyState
                size="compact"
                icon={Sparkles}
                title={
                  (ai?.prompts.total ?? 0) > 0
                    ? t("overview.ai.collectingTitle")
                    : t("pages.aiSummary.emptyTitle")
                }
                description={t("overview.aiTrendEmpty")}
              >
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`${base}/ai-visibility/prompts`} />}
                >
                  {t("overview.ai.action")}
                </Button>
              </EmptyState>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("overview.brandsTitle")}</CardTitle>
            <CardDescription>{t("overview.brandsDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2.5">
              {project.brands.map((brand) => (
                <li key={brand.id} className="flex items-center gap-2.5 text-sm">
                  <BrandSwatch slot={brand.colorSlot} />
                  <span className="min-w-0 truncate font-medium">{brand.name}</span>
                  <span className="min-w-0 truncate text-muted-foreground">
                    {brand.domains.join(", ")}
                  </span>
                  {brand.kind === "OWN" && (
                    <Badge variant="secondary" className="ml-auto shrink-0">
                      {t("overview.ownBrand")}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OpenLink({ href, label }: { href: string; label: string }) {
  return (
    <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={href} />}>
      {label}
      <ArrowRight />
    </Button>
  );
}

async function SearchSummary({ data, locale }: { data: SearchConsoleData; locale: Locale }) {
  const t = await getTranslations("overview.traffic");
  const { totals, previous } = data;
  const change = (before: number, now: number) => {
    const delta = before > 0 ? computeDelta(before, now) : null;
    return delta ? (
      <DeltaBadge delta={delta} label={formatPercent(delta.amount / before, locale, 0)} />
    ) : null;
  };
  const position = computeDelta(previous.position, totals.position, { lowerIsBetter: true });
  const stats = [
    {
      key: "clicks",
      value: formatCompact(totals.clicks, locale),
      delta: change(previous.clicks, totals.clicks),
    },
    {
      key: "impressions",
      value: formatCompact(totals.impressions, locale),
      delta: change(previous.impressions, totals.impressions),
    },
    {
      key: "position",
      value: totals.position !== null ? formatNumber(totals.position, locale, 1) : "—",
      delta:
        position && position.amount >= 0.05 ? (
          <DeltaBadge delta={position} label={formatNumber(position.amount, locale, 1)} />
        ) : null,
    },
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.key}>
            <dt className="text-sm text-muted-foreground">{t(stat.key)}</dt>
            <dd className="flex items-baseline gap-2">
              <span className="text-xl font-semibold tracking-tight">{stat.value}</span>
              {stat.delta}
            </dd>
          </div>
        ))}
      </dl>
      <TrafficChart
        daily={data.daily.map((point) => ({ date: point.date, clicks: point.clicks }))}
      />
    </div>
  );
}

/** Keywords per position band; bar length encodes the count, the count is printed beside it. */
async function RankDistribution({ rank, locale }: { rank: RankTrackerData; locale: Locale }) {
  const t = await getTranslations("rankTracker.buckets");
  const checked = rank.keywords.filter((keyword) => keyword.latest !== null);
  const counts = [
    ...BUCKETS.map((bucket) => ({
      key: bucket.key,
      count: checked.filter((keyword) => {
        const position = keyword.latest?.position ?? null;
        return position !== null && bucket.test(position);
      }).length,
    })),
    {
      key: "none" as const,
      count: checked.filter((keyword) => keyword.latest?.position == null).length,
    },
  ];
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
                background: entry.key === "none" ? "var(--muted-foreground)" : slotColor(1),
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

async function AuditSummary({ run, locale }: { run: AuditRunDetail; locale: Locale }) {
  const [t, ti] = await Promise.all([
    getTranslations("overview.audit"),
    getTranslations("siteAudit.issues"),
  ]);
  const top = run.issues
    .filter((issue) => issue.count > 0 && issue.severity !== "NOTICE" && isIssueCode(issue.code))
    .slice(0, 4);
  return (
    <div className="flex flex-col items-center gap-4">
      <ScoreRing score={run.healthScore} label={t("score")} size={104} />
      {top.length > 0 ? (
        <ul className="w-full divide-y rounded-lg border text-sm">
          {top.map((issue) => (
            <li key={issue.code} className="flex items-center gap-2 px-3 py-2">
              <SeverityIcon severity={issue.severity} />
              <span className="min-w-0 flex-1 truncate">
                {isIssueCode(issue.code) ? ti(`${issue.code}.title`) : issue.code}
              </span>
              <span className="font-medium tabular-nums">{formatNumber(issue.count, locale)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("noIssues")}</p>
      )}
    </div>
  );
}
