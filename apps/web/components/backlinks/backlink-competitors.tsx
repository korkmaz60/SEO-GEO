"use client";

import {
  BacklinkCompetitorsSchema,
  BacklinkCompetitorsStateSchema,
  type BacklinkCompetitors,
  type LinkGapDomain,
  type Locale,
  type Project,
} from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Settings, Swords, Unlink } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { usageQueryKey } from "@/components/app-shell/usage-meter";
import { EmptyState } from "@/components/data/empty-state";
import { ExternalLinkIcon } from "@/components/data/external-link";
import { RefreshDataButton } from "@/components/data/refresh-data";
import { SortHeader, compareValues, nextSort, type SortState } from "@/components/data/sort-header";
import { BrandSwatch } from "@/components/projects/brand-swatch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { slotColor } from "@/lib/chart-colors";
import {
  formatCompact,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format";
import { notBefore, useNow } from "@/lib/use-now";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { ScaleBar } from "./backlink-lists";
import { backlinkCompetitorsKey, backlinksKey } from "./queries";

/**
 * The project's backlink profile beside its competitors' and the link gap. Loaded on its own,
 * after its cost is shown, and kept for 7 days like the profile (D23).
 */
export function BacklinkCompetitorsPanel({ project }: { project: Project }) {
  const t = useTranslations("backlinks.competitors");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const canRun = useCan("member");
  const queryClient = useQueryClient();
  const now = useNow();
  const path = `/workspaces/${workspace.id}/projects/${project.id}/backlinks/competitors`;
  const key = backlinkCompetitorsKey(project.id);

  const state = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiGet(path, BacklinkCompetitorsStateSchema, { signal }),
  });
  const load = useMutation({
    mutationFn: (refresh: boolean) => apiSend("POST", path, { refresh }, BacklinkCompetitorsSchema),
    onSuccess: (report) => {
      queryClient.setQueryData(key, (previous) =>
        previous ? { ...previous, report, estimatedCostUsd: 0 } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: usageQueryKey(workspace.id) });
      // The project's own summary is part of both views.
      void queryClient.invalidateQueries({ queryKey: backlinksKey(project.id), exact: true });
    },
  });

  if (state.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("failed")}</AlertTitle>
        <AlertDescription>{errorMessage(state.error, t("failed"))}</AlertDescription>
      </Alert>
    );
  }
  if (!state.data) return <Skeleton className="h-64" />;
  const { brands, report } = state.data;

  if (brands.length < 2) {
    return (
      <EmptyState icon={Swords} title={t("emptyTitle")} description={t("emptyBody")} size="compact">
        {canRun && (
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/${workspace.slug}/${project.slug}/settings`} />}
          >
            <Settings />
            {t("settings")}
          </Button>
        )}
      </EmptyState>
    );
  }

  if (!report) {
    if (load.isPending) {
      return (
        <div className="flex flex-col gap-3" aria-busy>
          <p className="text-sm text-muted-foreground" role="status">
            {t("loading")}
          </p>
          <Skeleton className="h-48" />
          <Skeleton className="h-72" />
        </div>
      );
    }
    const cost = formatUsd(state.data.estimatedCostUsd, locale);
    const competitors = brands.length - 1;
    return (
      <div className="flex flex-col gap-3">
        {load.error && (
          <Alert variant="destructive">
            <AlertTitle>{t("failed")}</AlertTitle>
            <AlertDescription>{errorMessage(load.error, t("failed"))}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium">{t("load.title", { count: competitors })}</p>
            <p className="text-sm text-muted-foreground">
              {canRun
                ? t("load.body", { domain: state.data.target, cost })
                : t("load.viewer", { domain: state.data.target })}
            </p>
            <p className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-sm">
              {brands.slice(1).map((brand) => (
                <span key={brand.brandId} className="inline-flex items-center gap-1.5">
                  <BrandSwatch slot={brand.colorSlot} />
                  {brand.name}
                  <span className="text-muted-foreground">{brand.domain}</span>
                </span>
              ))}
            </p>
          </div>
          {canRun && (
            <Button className="shrink-0" onClick={() => load.mutate(false)}>
              <Swords />
              {t("load.run", { cost })}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("intro", { domain: report.target })}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <p
            className="text-xs text-muted-foreground"
            title={formatDateTime(report.source.fetchedAt, locale)}
          >
            {report.costUsd > 0
              ? t("cost", { cost: formatUsd(report.costUsd, locale) })
              : t("fetched", {
                  relative: formatRelativeTime(
                    new Date(report.source.fetchedAt),
                    locale,
                    notBefore(now, report.source.fetchedAt),
                  ),
                })}
          </p>
          {canRun && (
            <RefreshDataButton
              fetchedAt={report.source.fetchedAt}
              costUsd={state.data.refreshCostUsd}
              disabled={load.isPending}
              onRefresh={() => load.mutateAsync(true)}
            />
          )}
        </div>
      </div>
      <ProfilesTable report={report} project={project} />
      <LinkGapTable report={report} />
    </div>
  );
}

/** Every brand's backlink profile; bars keep each brand's color. */
function ProfilesTable({ report, project }: { report: BacklinkCompetitors; project: Project }) {
  const t = useTranslations("backlinks.competitors.profiles");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const max = Math.max(1, ...report.brands.map((brand) => brand.profile?.referringDomains ?? 0));

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="font-medium">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-48">{t("columns.brand")}</TableHead>
              <TableHead className="text-right">{t("columns.rank")}</TableHead>
              <TableHead className="min-w-48">{t("columns.referringDomains")}</TableHead>
              <TableHead className="text-right">{t("columns.backlinks")}</TableHead>
              <TableHead className="text-right">{t("columns.nofollow")}</TableHead>
              <TableHead className="text-right">{t("columns.spamScore")}</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">{t("columns.actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.brands.map((brand) => {
              const profile = brand.profile;
              const overview = `/${workspace.slug}/research/domains?${new URLSearchParams({
                domain: brand.domain,
                market: String(project.locationCode),
              }).toString()}`;
              return (
                <TableRow key={brand.brandId}>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <BrandSwatch slot={brand.colorSlot} />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {brand.name}
                          {brand.kind === "OWN" && (
                            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                              {t("you")}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {brand.domain}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {profile?.rank != null ? formatNumber(profile.rank, locale) : "—"}
                  </TableCell>
                  <TableCell>
                    {profile ? (
                      <span className="grid grid-cols-[1fr_4rem] items-center gap-2">
                        <span className="h-2 rounded-r-sm bg-muted">
                          <span
                            className="block h-2 rounded-r-sm"
                            style={{
                              width: `${(profile.referringDomains / max) * 100}%`,
                              background: slotColor(brand.colorSlot),
                            }}
                          />
                        </span>
                        <span className="text-right tabular-nums">
                          {formatNumber(profile.referringDomains, locale)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("noLinks")}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {profile ? formatCompact(profile.backlinks, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {profile && profile.referringDomains > 0
                      ? formatPercent(
                          profile.referringDomainsNofollow / profile.referringDomains,
                          locale,
                          0,
                        )
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {profile?.spamScore != null ? formatNumber(profile.spamScore, locale) : "—"}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      nativeButton={false}
                      render={<Link href={overview} />}
                      aria-label={t("analyze", { domain: brand.domain })}
                    >
                      <ArrowRight />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

type GapSort = "domain" | "competitors" | "rank" | "backlinks" | "firstSeen";

function gapValue(row: LinkGapDomain, key: GapSort): number | string | null {
  switch (key) {
    case "domain":
      return row.domain;
    case "competitors":
      return row.links.length;
    case "rank":
      return row.rank;
    case "backlinks":
      return row.links.reduce((sum, link) => sum + link.backlinks, 0);
    case "firstSeen": {
      const times = row.links.flatMap((link) =>
        link.firstSeen ? [Date.parse(link.firstSeen)] : [],
      );
      return times.length > 0 ? Math.min(...times) : null;
    }
  }
}

/** Domains linking to competitors but not to the project, filterable by competitor. */
function LinkGapTable({ report }: { report: BacklinkCompetitors }) {
  const t = useTranslations("backlinks.competitors.gap");
  const tl = useTranslations("backlinks.lists");
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState("");
  const [competitor, setCompetitor] = useState("all");
  const [sort, setSort] = useState<SortState<GapSort>>({ key: "competitors", direction: -1 });
  const brands = new Map(report.brands.map((brand) => [brand.brandId, brand]));
  const competitors = report.brands.filter((brand) => brand.kind === "COMPETITOR");
  const needle = search.trim().toLocaleLowerCase(locale);
  const rows = useMemo(
    () =>
      report.linkGap
        .filter((row) => !needle || row.domain.toLocaleLowerCase(locale).includes(needle))
        .filter(
          (row) => competitor === "all" || row.links.some((link) => link.brandId === competitor),
        )
        .sort((a, b) =>
          compareValues(gapValue(a, sort.key), gapValue(b, sort.key), sort.direction, locale),
        ),
    [report.linkGap, needle, competitor, sort, locale],
  );
  const header = (label: string, key: GapSort, className?: string) => (
    <SortHeader
      label={label}
      column={key}
      sort={sort}
      onSort={(column) =>
        setSort((previous) => nextSort(previous, column, (next) => (next === "domain" ? 1 : -1)))
      }
      className={className}
    />
  );
  const competitorItems = [
    { value: "all", label: t("allCompetitors") },
    ...competitors.map((brand) => ({ value: brand.brandId, label: brand.name })),
  ];

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-medium">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("description", { domain: report.target })}
        </p>
      </div>
      {report.linkGap.length === 0 ? (
        <EmptyState
          icon={Unlink}
          title={t("emptyTitle")}
          description={t("emptyBody")}
          size="compact"
        />
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              className="w-full sm:w-64"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tl("filter")}
              aria-label={tl("filter")}
            />
            <Select
              items={competitorItems}
              value={competitor}
              onValueChange={(value) => value && setCompetitor(value)}
            >
              <SelectTrigger className="w-full sm:w-56" aria-label={t("competitor")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {competitorItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground sm:ml-auto" aria-live="polite">
              {t("summary", { count: rows.length })}
            </p>
          </div>
          <div className="max-h-[36rem] overflow-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  {header(t("columns.domain"), "domain", "min-w-52")}
                  {header(t("columns.linksTo"), "competitors", "min-w-48")}
                  {header(t("columns.rank"), "rank")}
                  {header(t("columns.backlinks"), "backlinks", "text-right")}
                  {header(t("columns.firstSeen"), "firstSeen")}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                      {tl("noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const firstSeen = gapValue(row, "firstSeen");
                    return (
                      <TableRow key={row.domain}>
                        <TableCell>
                          <span className="flex max-w-72 items-center gap-1.5">
                            <span className="truncate font-medium" title={row.domain}>
                              {row.domain}
                            </span>
                            <ExternalLinkIcon
                              url={`https://${row.domain}`}
                              label={tl("visit", { domain: row.domain })}
                            />
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-x-3 gap-y-1">
                            {row.links.map((link) => {
                              const brand = brands.get(link.brandId);
                              return (
                                <span
                                  key={link.brandId}
                                  className="inline-flex items-center gap-1.5"
                                >
                                  <BrandSwatch slot={brand?.colorSlot ?? 8} />
                                  {brand?.name ?? "—"}
                                </span>
                              );
                            })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <ScaleBar value={row.rank} locale={locale} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(gapValue(row, "backlinks") as number, locale)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {typeof firstSeen === "number"
                            ? formatDate(new Date(firstSeen), locale)
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </section>
  );
}
