import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ScanSearch,
  Sparkles,
  TrendingUp,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { ShareOfVoiceSample, type SharePoint } from "@/components/charts/share-of-voice-sample";
import { EmptyState } from "@/components/data/empty-state";
import { KpiTile } from "@/components/data/kpi-tile";
import { ScoreRing } from "@/components/data/score-ring";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeDelta, formatNumber, formatPercent } from "@/lib/format";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("design");
  return { title: t("title") };
}

const HUES = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"] as const;

const SURFACES = [
  ["background", "bg-background"],
  ["card", "bg-card"],
  ["muted", "bg-muted"],
  ["accent", "bg-accent"],
  ["primary", "bg-primary"],
  ["border", "bg-border"],
] as const;

const STATUS: {
  key: "statusGood" | "statusWarning" | "statusSerious" | "statusCritical";
  icon: LucideIcon;
  className: string;
}[] = [
  { key: "statusGood", icon: CheckCircle2, className: "text-success" },
  { key: "statusWarning", icon: AlertTriangle, className: "text-warning" },
  { key: "statusSerious", icon: AlertOctagon, className: "text-serious" },
  { key: "statusCritical", icon: XCircle, className: "text-critical" },
];

// Style-guide sample data, labelled as such on the page.
const SAMPLE_SHARE: SharePoint[] = [
  { week: "W1", own: 18, competitor: 31 },
  { week: "W2", own: 21, competitor: 30 },
  { week: "W3", own: 20, competitor: 32 },
  { week: "W4", own: 26, competitor: 29 },
  { week: "W5", own: 29, competitor: 28 },
  { week: "W6", own: 33, competitor: 27 },
  { week: "W7", own: 35, competitor: 27 },
  { week: "W8", own: 38, competitor: 25 },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {hint && <p className="max-w-2xl text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Swatch({
  className,
  style,
  label,
}: {
  className?: string;
  style?: React.CSSProperties;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className={`h-14 rounded-lg border ${className ?? ""}`} style={style} />
      <p className="font-mono text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default async function DesignPage() {
  const t = await getTranslations();
  const locale = await getLocale();
  const rankDelta = computeDelta(8, 3, { lowerIsBetter: true });
  const shareDelta = computeDelta(0.25, 0.38);

  return (
    <div className="flex flex-col gap-12">
      <PageHeader title={t("design.title")} description={t("design.description")} />

      <Section title={t("design.surfaces")}>
        <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
          {SURFACES.map(([name, className]) => (
            <Swatch key={name} className={className} label={name} />
          ))}
        </div>
      </Section>

      <Section title={t("design.accents")}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          <Swatch className="bg-seo" label="--seo" />
          <Swatch className="bg-geo" label="--geo" />
        </div>
      </Section>

      <Section title={t("design.status")}>
        <div className="flex flex-wrap gap-3">
          {STATUS.map(({ key, icon: Icon, className }) => (
            <Badge key={key} variant="outline" className="h-7 gap-1.5 px-3 text-sm">
              <Icon className={`size-4! ${className}`} aria-hidden />
              {t(`design.${key}`)}
            </Badge>
          ))}
        </div>
      </Section>

      <Section title={t("design.chartPalette")} hint={t("design.chartPaletteHint")}>
        <div className="grid grid-cols-4 gap-4 md:grid-cols-8">
          {HUES.map((hue, index) => (
            <Swatch
              key={hue}
              style={{ background: `var(--chart-${index + 1})` }}
              label={`${index + 1} · ${t(`design.hues.${hue}`)}`}
            />
          ))}
        </div>
      </Section>

      <Section title={t("design.typography")}>
        <div className="space-y-3">
          <p className="text-2xl font-semibold tracking-tight">Geist Sans · 24 / semibold</p>
          <p className="text-lg font-semibold">Geist Sans · 18 / semibold</p>
          <p className="text-sm">
            Geist Sans · 14 / regular — {formatNumber(1234567.89, locale, 2)}
          </p>
          <p className="text-xs text-muted-foreground">Geist Sans · 12 / muted</p>
          <p className="font-mono text-sm">Geist Mono · https://example.com/blog/seo</p>
        </div>
      </Section>

      <Section title={t("design.buttons")}>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Section>

      <Section title={t("design.kpiTiles")} hint={t("common.sampleData")}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiTile
            label={t("kpi.shareOfVoice")}
            icon={Sparkles}
            accent="geo"
            value={formatPercent(0.38, locale, 0)}
            emptyLabel={t("common.noData")}
            delta={
              shareDelta
                ? {
                    delta: shareDelta,
                    label: t("common.percentagePoints", {
                      value: formatNumber(shareDelta.amount * 100, locale),
                    }),
                  }
                : null
            }
            provenance={{
              source: "DataForSEO AI Optimization",
              method: "v1",
              updatedAt: "—",
              labels: {
                source: t("common.source"),
                method: t("common.method"),
                updated: t("common.updated"),
              },
            }}
          />
          <KpiTile
            label={t("kpi.avgPosition")}
            icon={TrendingUp}
            accent="seo"
            value={formatNumber(3, locale)}
            emptyLabel={t("common.noData")}
            delta={
              rankDelta ? { delta: rankDelta, label: formatNumber(rankDelta.amount, locale) } : null
            }
          />
          <KpiTile
            label={t("kpi.siteHealth")}
            icon={ScanSearch}
            accent="seo"
            value={null}
            emptyLabel={t("common.noData")}
          />
          <Card className="items-center justify-center p-4">
            <ScoreRing score={72} label={t("overview.aiScore")} color="var(--geo)" size={96} />
          </Card>
        </div>
      </Section>

      <Section title={t("design.chartExample")} hint={t("design.chartExampleHint")}>
        <Card>
          <CardHeader>
            <CardTitle>{t("design.shareOfVoice")}</CardTitle>
            <CardDescription>{t("common.sampleData")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ShareOfVoiceSample
              data={SAMPLE_SHARE}
              labels={{
                own: t("design.ownBrand"),
                competitor: t("design.competitor"),
                week: t("design.week"),
                shareOfVoice: t("design.shareOfVoice"),
                tableView: t("design.tableView"),
              }}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title={t("design.emptyStates")}>
        <EmptyState
          icon={TrendingUp}
          title={t("pages.rankTracker.emptyTitle")}
          description={t("pages.rankTracker.emptyBody")}
        />
      </Section>
    </div>
  );
}
