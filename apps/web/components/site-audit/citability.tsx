"use client";

import {
  CITABILITY_FACTORS,
  CITABILITY_WEIGHTS,
  type AuditRunDetail,
  type CitabilityFactor,
  type CitabilityFactorResult,
  type Locale,
} from "@seo-geo/contracts";
import { Quote } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ScoreRing } from "@/components/data/score-ring";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A 0–1 value as a thin bar; the number is next to it, never color alone. */
function ValueBar({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("block h-1.5 rounded-full bg-muted", className)} aria-hidden>
      {value !== null && (
        <span
          className="block h-1.5 rounded-full bg-primary"
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      )}
    </span>
  );
}

/** Site-wide citability: the mean score and what most pages lack. */
export function CitabilityOverview({
  run,
  onShowPages,
}: {
  run: AuditRunDetail;
  onShowPages: () => void;
}) {
  const t = useTranslations("siteAudit.citability");
  const locale = useLocale() as Locale;
  const stats = run.stats?.citability;
  if (!stats) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("notScored")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }
  const factors = [...CITABILITY_FACTORS].sort(
    (a, b) =>
      CITABILITY_WEIGHTS[b] * (1 - (stats.factors[b].average ?? 1)) -
      CITABILITY_WEIGHTS[a] * (1 - (stats.factors[a].average ?? 1)),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
        {stats.scored > 0 && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onShowPages}>
              <Quote />
              {t("showLowPages")}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[10rem_1fr]">
        <div className="flex flex-col items-center gap-1">
          <ScoreRing score={stats.average} label={t("average")} size={112} />
          <p className="text-xs text-muted-foreground">{t("scored", { count: stats.scored })}</p>
        </div>
        <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2" aria-label={t("factorsTitle")}>
          {factors.map((factor) => {
            const entry = stats.factors[factor];
            return (
              <li key={factor} className="flex flex-col gap-1 text-sm">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate">{t(`factors.${factor}.title`)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {entry.average === null
                      ? t("notJudged")
                      : formatPercent(entry.average, locale, 0)}
                  </span>
                </span>
                <ValueBar value={entry.average} />
                {entry.below > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t("toImprove", { count: entry.below })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

/** One line on what a factor's value was computed from. */
export function useFactorDetail() {
  const t = useTranslations("siteAudit.citability.details");
  const locale = useLocale() as Locale;
  return (factor: CitabilityFactor, data: Record<string, unknown>): string => {
    const number = (key: string) => (typeof data[key] === "number" ? (data[key] as number) : null);
    switch (factor) {
      case "answer_first": {
        const words = number("introWords") ?? 0;
        const share = number("topicShare");
        if (words === 0) return t("noIntro");
        return share === null
          ? t("introWords", { words })
          : t("intro", { words, share: formatPercent(share, locale, 0) });
      }
      case "question_headings": {
        const headings = number("headings") ?? 0;
        return headings === 0
          ? t("noHeadings")
          : t("questions", { questions: number("questions") ?? 0, headings });
      }
      case "structured_content":
        return t("structures", {
          lists: number("lists") ?? 0,
          tables: number("tables") ?? 0,
          words: formatNumber(number("words") ?? 0, locale),
        });
      case "structured_data": {
        const types = Array.isArray(data.types) ? (data.types as string[]) : [];
        const invalid = number("invalid") ?? 0;
        const found = types.length > 0 ? t("types", { types: types.join(", ") }) : t("noTypes");
        return invalid > 0 ? `${found} ${t("invalid", { count: invalid })}` : found;
      }
      case "authorship":
        return t("authorship", {
          author: String(data.author === true),
          about: String(data.aboutOrContact === true),
        });
      case "freshness": {
        const date = typeof data.date === "string" ? data.date : null;
        return date ? t("dated", { date, days: number("ageDays") ?? 0 }) : t("noDate");
      }
      case "evidence":
        return t("evidence", {
          links: number("externalLinks") ?? 0,
          figures: number("figures") ?? 0,
        });
      case "readability": {
        const score = number("score");
        return score === null
          ? t("readabilityNotJudged")
          : t("readability", {
              formula: String(data.formula),
              score: formatNumber(score, locale, 1),
            });
      }
      case "ai_crawler_access": {
        const blocked = Array.isArray(data.blocked) ? (data.blocked as string[]) : [];
        return blocked.length > 0 ? t("blocked", { bots: blocked.join(", ") }) : t("allowed");
      }
    }
  };
}

/** A page's factors: value, weight, what it was computed from and what to change. */
export function CitabilityFactors({
  factors,
  recommendations,
}: {
  factors: CitabilityFactorResult[];
  recommendations: CitabilityFactor[];
}) {
  const t = useTranslations("siteAudit.citability");
  const locale = useLocale() as Locale;
  const detail = useFactorDetail();
  const order = [
    ...recommendations,
    ...CITABILITY_FACTORS.filter((factor) => !recommendations.includes(factor)),
  ];
  const byFactor = new Map(factors.map((entry) => [entry.factor, entry]));
  return (
    <ul className="flex flex-col divide-y rounded-lg border">
      {order.map((factor) => {
        const entry = byFactor.get(factor);
        if (!entry) return null;
        const improve = entry.value !== null && entry.value < 1;
        return (
          <li key={factor} className="flex flex-col gap-1.5 px-3 py-2.5 text-sm">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{t(`factors.${factor}.title`)}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {entry.value === null
                  ? t("notJudged")
                  : `${formatPercent(entry.value, locale, 0)} · ${t("weight", {
                      weight: formatPercent(entry.weight, locale, 0),
                    })}`}
              </span>
            </span>
            <ValueBar value={entry.value} />
            <span className="text-xs text-muted-foreground">{detail(factor, entry.data)}</span>
            {improve && (
              <span className="text-xs">
                <span className="font-medium">{t("recommendation")}: </span>
                {t(`factors.${factor}.recommendation`)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
