"use client";

import {
  KeywordDetailSchema,
  type Locale,
  type Project,
  type RankFrequency,
} from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { TimeSeriesChart, type SeriesPoint } from "@/components/charts/time-series-chart";
import { Difficulty, IntentBadge } from "@/components/keywords/keyword-metrics";
import { SerpFeatureIcons } from "@/components/keywords/serp-features";
import { BrandSwatch } from "@/components/projects/brand-swatch";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { slotColor } from "@/lib/chart-colors";
import { formatCompact, formatDay, formatNumber, formatUsd } from "@/lib/format";
import { findMarket } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";

import type { BrandRef } from "./brands";
import { PositionCell } from "./keyword-table";

interface KeywordDetailSheetProps {
  project: Project;
  brands: BrandRef[];
  keywordId: string | null;
  canEdit: boolean;
  onClose: () => void;
}

/** A keyword's position history against competitors, its latest SERP and its settings. */
export function KeywordDetailSheet({
  project,
  brands,
  keywordId,
  canEdit,
  onClose,
}: KeywordDetailSheetProps) {
  const t = useTranslations("rankTracker.detail");
  const tr = useTranslations("rankTracker");
  const td = useTranslations("projectSettings.devices");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const base = `/workspaces/${workspace.id}/projects/${project.id}/rank-tracker`;
  const detail = useQuery({
    queryKey: ["rank-tracker", project.id, "keyword", keywordId],
    queryFn: ({ signal }) =>
      apiGet(`${base}/keywords/${keywordId}?days=90`, KeywordDetailSchema, { signal }),
    enabled: keywordId !== null,
  });
  const data = detail.data;
  const keyword = data?.keyword;
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const own = brands.find((brand) => brand.kind === "OWN");
  const competitors = brands.filter((brand) => brand.kind === "COMPETITOR");

  const series = [
    { key: "own", label: own?.name ?? project.name, color: slotColor(1) },
    ...competitors.map((brand) => ({
      key: `c${brand.colorSlot}`,
      label: brand.name,
      color: slotColor(brand.colorSlot),
    })),
  ];
  const points: SeriesPoint[] = (data?.history ?? []).map((point) => ({
    date: point.date,
    own: point.position,
    ...Object.fromEntries(
      competitors.map((brand) => [`c${brand.colorSlot}`, point.competitors[brand.id] ?? null]),
    ),
  }));
  const market = keyword ? findMarket(keyword.locationCode) : null;

  return (
    <Sheet open={keywordId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-8 text-lg">{keyword?.keyword ?? " "}</SheetTitle>
          <SheetDescription>
            {keyword
              ? [
                  market ? market.names[locale] : keyword.locationCode,
                  keyword.languageCode,
                  td(keyword.device),
                ].join(" · ")
              : " "}
          </SheetDescription>
        </SheetHeader>

        {!data || !keyword ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Metric label={t("position")}>
                <PositionCell keyword={keyword} />
              </Metric>
              <Metric label={t("volume")}>
                {keyword.metrics?.searchVolume != null
                  ? formatCompact(keyword.metrics.searchVolume, locale)
                  : "—"}
              </Metric>
              <Metric label={t("difficulty")}>
                <Difficulty value={keyword.metrics?.keywordDifficulty ?? null} />
              </Metric>
              <Metric label={t("cpc")}>
                {keyword.metrics?.cpc != null ? formatUsd(keyword.metrics.cpc, locale) : "—"}
              </Metric>
              <Metric label={t("intent")}>
                <IntentBadge intent={keyword.metrics?.intent ?? null} />
              </Metric>
            </dl>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("historyTitle")}</h3>
              {points.length < 2 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t("historyEmpty")}
                </p>
              ) : (
                <TimeSeriesChart
                  data={points}
                  series={series}
                  reversed
                  yDomain={[1, "dataMax"]}
                  formatDate={(day) => formatDay(day, locale)}
                  formatValue={(value) => formatNumber(value, locale)}
                  tableLabel={t("historyTable")}
                  dateLabel={t("date")}
                  className="h-56"
                />
              )}
              <p className="text-xs text-muted-foreground">
                {t("historyNote", { depth: keyword.latest?.depth ?? 30 })}
              </p>
            </section>

            {data.serp && (
              <section className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-medium">{t("serpTitle")}</h3>
                  <span className="text-xs text-muted-foreground">
                    {t("serpFetched", {
                      date: formatDay(data.serp.fetchedAt.slice(0, 10), locale),
                    })}
                  </span>
                </div>
                {keyword.latest && (
                  <SerpFeatureIcons
                    features={keyword.latest.serpFeatures}
                    owned={keyword.latest.ownedFeatures}
                    aiOverviewCited={keyword.latest.aiOverviewCited}
                    max={12}
                  />
                )}
                {data.serp.aiOverview && (
                  <div className="rounded-lg border p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <Sparkles className="size-4 text-primary" aria-hidden />
                      {t("aiOverviewSources")}
                    </p>
                    {data.serp.aiOverview.references.length === 0 ? (
                      <p className="text-sm text-muted-foreground">{t("aiOverviewNoSources")}</p>
                    ) : (
                      <ol className="space-y-1.5 text-sm">
                        {data.serp.aiOverview.references.map((reference, index) => {
                          const brand = reference.entityId
                            ? brandById.get(reference.entityId)
                            : undefined;
                          return (
                            <li
                              key={`${reference.url}-${index}`}
                              className="flex items-center gap-2"
                            >
                              {brand ? (
                                <BrandSwatch slot={brand.colorSlot} />
                              ) : (
                                <span className="size-2.5" />
                              )}
                              <span className={cn("min-w-0 truncate", brand && "font-medium")}>
                                {reference.title ?? reference.domain}
                              </span>
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                {reference.domain}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                )}
                <ol className="divide-y rounded-lg border text-sm">
                  {data.serp.results.map((result) => {
                    const brand = result.entityId ? brandById.get(result.entityId) : undefined;
                    return (
                      <li
                        key={`${result.position}-${result.url}`}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2",
                          brand?.kind === "OWN" && "bg-primary/5",
                        )}
                      >
                        <span className="w-6 shrink-0 text-right font-medium tabular-nums text-muted-foreground">
                          {result.position}
                        </span>
                        {brand ? (
                          <BrandSwatch slot={brand.colorSlot} />
                        ) : (
                          <span className="size-2.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className={cn("truncate", brand && "font-medium")}>
                            {result.title ?? result.domain}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">{result.url}</p>
                        </div>
                        {result.url && (
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            aria-label={t("openResult")}
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            )}

            {canEdit && (
              <KeywordSettings
                key={keyword.id}
                base={base}
                projectId={project.id}
                keywordId={keyword.id}
                targetUrl={keyword.targetUrl}
                tags={keyword.tags}
                frequency={keyword.frequency}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {tr("addedOn", { date: formatDay(keyword.createdAt.slice(0, 10), locale) })}
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

function KeywordSettings({
  base,
  projectId,
  keywordId,
  targetUrl,
  tags,
  frequency,
}: {
  base: string;
  projectId: string;
  keywordId: string;
  targetUrl: string | null;
  tags: string[];
  frequency: RankFrequency;
}) {
  const t = useTranslations("rankTracker.detail");
  const ta = useTranslations("rankTracker.add");
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(targetUrl ?? "");
  const [tagText, setTagText] = useState(tags.join(", "));
  const [schedule, setSchedule] = useState<RankFrequency>(frequency);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await apiSend("PATCH", `${base}/keywords/${keywordId}`, {
        targetUrl: url.trim() || null,
        tags: tagText
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        frequency: schedule,
      });
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["rank-tracker", projectId] });
    } catch (caught) {
      toast.error(errorMessage(caught, t("saveFailed")));
    } finally {
      setPending(false);
    }
  }

  const frequencyItems = (["DAILY", "WEEKLY"] as const).map((value) => ({
    value,
    label: ta(`frequencies.${value}`),
  }));
  return (
    <form onSubmit={save} className="space-y-3 rounded-lg border p-3">
      <h3 className="text-sm font-medium">{t("settingsTitle")}</h3>
      <FieldGroup className="gap-3">
        <Field>
          <FieldLabel htmlFor="target-url">{t("targetUrl")}</FieldLabel>
          <Input
            id="target-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="keyword-tags">{ta("tags")}</FieldLabel>
            <Input
              id="keyword-tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{ta("frequency")}</FieldLabel>
            <Select
              items={frequencyItems}
              value={schedule}
              onValueChange={(value) => value && setSchedule(value as RankFrequency)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
