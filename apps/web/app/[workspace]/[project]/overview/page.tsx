import { hasWorkspaceRole, type Locale } from "@seo-geo/contracts";
import {
  ArrowRight,
  BarChart3,
  Check,
  KeyRound,
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

import type { Milestone } from "@/components/app-shell/nav-config";
import { EmptyState } from "@/components/data/empty-state";
import { KpiTile } from "@/components/data/kpi-tile";
import { ScoreRing } from "@/components/data/score-ring";
import { PageHeader } from "@/components/page-header";
import { BrandSwatch } from "@/components/projects/brand-swatch";
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
import { findMarket } from "@/lib/locations";
import { formatUsd } from "@/lib/format";
import { getCredentials, getProject, getUsage, getWorkspace } from "@/lib/server/api";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: PageProps<"/[workspace]/[project]/overview">): Promise<Metadata> {
  const { workspace: workspaceSlug, project: projectSlug } = await params;
  const t = await getTranslations("pages.overview");
  const project = await getProject((await getWorkspace(workspaceSlug)).id, projectSlug);
  return { title: `${t("title")} · ${project.name}` };
}

const KPIS: {
  key: "aiVisibility" | "shareOfVoice" | "avgPosition" | "trackedKeywords" | "siteHealth" | "spend";
  icon: LucideIcon;
}[] = [
  { key: "aiVisibility", icon: Sparkles },
  { key: "shareOfVoice", icon: Swords },
  { key: "avgPosition", icon: TrendingUp },
  { key: "trackedKeywords", icon: Search },
  { key: "siteHealth", icon: ScanSearch },
  { key: "spend", icon: Wallet },
];

interface SetupStep {
  key: "provider" | "brand" | "keywords" | "audit" | "gsc";
  icon: LucideIcon;
  done: boolean;
  /** Where to complete the step; steps of later milestones show the milestone instead. */
  href?: string;
  milestone?: Milestone;
}

export default async function OverviewPage({
  params,
}: PageProps<"/[workspace]/[project]/overview">) {
  const { workspace: workspaceSlug, project: projectSlug } = await params;
  const [t, locale, workspace] = await Promise.all([
    getTranslations(),
    getLocale() as Promise<Locale>,
    getWorkspace(workspaceSlug),
  ]);
  const [project, credentials, usage] = await Promise.all([
    getProject(workspace.id, projectSlug),
    getCredentials(workspace.id),
    getUsage(workspace.id),
  ]);
  const isAdmin = hasWorkspaceRole(workspace.role, "admin");
  const market = findMarket(project.locationCode);
  const connected = credentials.some(
    (credential) => credential.provider === "DATAFORSEO" && credential.status === "VALID",
  );
  const base = `/${workspace.slug}/${project.slug}`;

  const steps: SetupStep[] = [
    {
      key: "provider",
      icon: KeyRound,
      done: connected,
      href: isAdmin ? `/${workspace.slug}/settings/providers` : undefined,
    },
    {
      key: "brand",
      icon: Tags,
      done: project.brands.some((brand) => brand.kind === "COMPETITOR"),
      href: `${base}/settings#brands`,
    },
    { key: "keywords", icon: Search, done: false, milestone: "M2" },
    { key: "audit", icon: ScanSearch, done: false, milestone: "M2" },
    { key: "gsc", icon: BarChart3, done: false, milestone: "M2" },
  ];
  const completed = steps.filter((step) => step.done).length;

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
        {KPIS.map((kpi) => (
          <KpiTile
            key={kpi.key}
            label={t(`kpi.${kpi.key}`)}
            icon={kpi.icon}
            // Spend is workspace-wide and real from M1 on; the other metrics arrive with M2–M3.
            value={kpi.key === "spend" ? formatUsd(usage.totalUsd, locale) : null}
            emptyLabel={t("common.noData")}
          />
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("overview.aiTrendTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              size="compact"
              icon={Sparkles}
              title={t("pages.aiSummary.emptyTitle")}
              description={t("overview.aiTrendEmpty")}
            />
          </CardContent>
        </Card>

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
                  {step.milestone ? (
                    <Badge variant="outline" className="shrink-0">
                      {step.milestone}
                    </Badge>
                  ) : (
                    !step.done &&
                    step.href && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t(`onboarding.steps.${step.key}`)}
                        nativeButton={false}
                        render={<Link href={step.href} />}
                      >
                        <ArrowRight />
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("overview.rankTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState
              size="compact"
              icon={TrendingUp}
              title={t("overview.rankEmptyTitle")}
              description={t("overview.rankEmpty")}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
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

          <Card>
            <CardHeader>
              <CardTitle>{t("overview.scoresTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-around gap-4 py-2">
              <ScoreRing score={null} label={t("overview.aiScore")} />
              <ScoreRing score={null} label={t("overview.siteHealth")} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
