import {
  BarChart3,
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
import { getTranslations } from "next-intl/server";

import type { Milestone } from "@/components/app-shell/nav-config";
import { EmptyState } from "@/components/data/empty-state";
import { KpiTile } from "@/components/data/kpi-tile";
import { ScoreRing } from "@/components/data/score-ring";
import { MilestoneBadge, pageMetadata } from "@/components/module-page";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const generateMetadata = pageMetadata("overview");

const KPIS: {
  key: "aiVisibility" | "shareOfVoice" | "avgPosition" | "trackedKeywords" | "siteHealth" | "spend";
  icon: LucideIcon;
  accent?: "seo" | "geo";
}[] = [
  { key: "aiVisibility", icon: Sparkles, accent: "geo" },
  { key: "shareOfVoice", icon: Swords, accent: "geo" },
  { key: "avgPosition", icon: TrendingUp, accent: "seo" },
  { key: "trackedKeywords", icon: Search, accent: "seo" },
  { key: "siteHealth", icon: ScanSearch, accent: "seo" },
  { key: "spend", icon: Wallet },
];

const ONBOARDING: {
  key: "provider" | "brand" | "keywords" | "audit" | "gsc";
  icon: LucideIcon;
  milestone: Milestone;
}[] = [
  { key: "provider", icon: KeyRound, milestone: "M1" },
  { key: "brand", icon: Tags, milestone: "M1" },
  { key: "keywords", icon: Search, milestone: "M2" },
  { key: "audit", icon: ScanSearch, milestone: "M2" },
  { key: "gsc", icon: BarChart3, milestone: "M2" },
];

export default async function OverviewPage() {
  const t = await getTranslations();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={t("pages.overview.title")}
        description={t("pages.overview.description")}
        badge={<MilestoneBadge milestone="M2" />}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KPIS.map((kpi) => (
          <KpiTile
            key={kpi.key}
            label={t(`kpi.${kpi.key}`)}
            icon={kpi.icon}
            accent={kpi.accent}
            value={null}
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
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {ONBOARDING.map((step, index) => (
                <li key={step.key} className="flex items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <step.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm">
                    {t(`onboarding.steps.${step.key}`)}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {step.milestone}
                  </Badge>
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

        <Card>
          <CardHeader>
            <CardTitle>{t("overview.scoresTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-around gap-4 py-2">
            <ScoreRing score={null} label={t("overview.aiScore")} color="var(--geo)" />
            <ScoreRing score={null} label={t("overview.siteHealth")} color="var(--seo)" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
