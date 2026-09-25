"use client";

import { AiSourcesSchema, type AiPlatform, type AiSources, type Locale } from "@seo-geo/contracts";
import { useQuery } from "@tanstack/react-query";
import { FileText, Globe, Quote } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { ExternalLinkIcon } from "@/components/data/external-link";
import { KpiTile } from "@/components/data/kpi-tile";
import { PageHeader } from "@/components/page-header";
import { BrandSwatch } from "@/components/projects/brand-swatch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { slotColor } from "@/lib/chart-colors";
import { formatNumber, formatPercent } from "@/lib/format";
import { useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { brandName, RangeToggle } from "./ai-summary-view";
import { PLATFORM_CODES, PLATFORM_NAMES } from "./platforms";
import { aiBase, useAiSummary, type AiDays } from "./queries";

export function SourcesView() {
  const t = useTranslations("aiVisibility.sources");
  const tp = useTranslations("pages.sources");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const [days, setDays] = useState<AiDays>(30);
  const summary = useAiSummary(project?.id ?? null, days);
  const sources = useQuery({
    queryKey: ["ai-visibility", project?.id, "sources", days],
    queryFn: ({ signal }) =>
      apiGet(`${aiBase(workspace.id, project?.id ?? "")}/sources?days=${days}`, AiSourcesSchema, {
        signal,
      }),
    enabled: project !== null,
  });

  if (!project) return null;
  const data = sources.data;
  const brands = summary.data?.brands ?? [];
  const own = brands.find((brand) => brand.kind === "OWN");
  const ownCitations = data?.domains
    .filter((row) => own && row.entityId === own.entityId)
    .reduce((sum, row) => sum + row.citations, 0);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={<RangeToggle days={days} onChange={setDays} />}
      />
      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.totalCitations === 0 ? (
        <EmptyState icon={Quote} title={tp("emptyTitle")} description={tp("emptyBody")} />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile
              label={t("citations")}
              icon={Quote}
              value={formatNumber(data.totalCitations, locale)}
              emptyLabel={tc("noData")}
            />
            <KpiTile
              label={t("domains")}
              icon={Globe}
              value={formatNumber(data.domains.length, locale)}
              emptyLabel={tc("noData")}
              detail={data.domains.length >= 100 ? t("topHundred") : null}
            />
            <KpiTile
              label={t("ownShare")}
              icon={FileText}
              value={formatPercent((ownCitations ?? 0) / data.totalCitations, locale, 0)}
              emptyLabel={tc("noData")}
              detail={t("ownCitations", { count: ownCitations ?? 0 })}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{t("domainsTitle")}</CardTitle>
              <CardDescription>{t("domainsDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <DomainTable data={data} brands={brands} locale={locale} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("pagesTitle")}</CardTitle>
              <CardDescription>{t("pagesDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {data.pages.length === 0 ? (
                <p className="px-6 text-sm text-muted-foreground">{t("noOwnPages")}</p>
              ) : (
                <PageTable data={data} locale={locale} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Platforms({ platforms }: { platforms: AiPlatform[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {platforms.map((platform) => (
        <abbr
          key={platform}
          title={PLATFORM_NAMES[platform]}
          className="rounded border px-1 text-[11px] text-muted-foreground no-underline"
        >
          {PLATFORM_CODES[platform]}
        </abbr>
      ))}
    </span>
  );
}

function DomainTable({
  data,
  brands,
  locale,
}: {
  data: AiSources;
  brands: Parameters<typeof brandName>[0];
  locale: Locale;
}) {
  const t = useTranslations("aiVisibility.sources");
  const max = Math.max(...data.domains.map((row) => row.share));
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">{t("domain")}</TableHead>
          <TableHead>{t("share")}</TableHead>
          <TableHead className="text-right">{t("citations")}</TableHead>
          <TableHead className="text-right">{t("prompts")}</TableHead>
          <TableHead className="pr-6">{t("platforms")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.domains.map((row) => {
          const brand = row.entityId ? brandName(brands, row.entityId) : undefined;
          return (
            <TableRow key={row.domain}>
              <TableCell className="pl-6">
                <span className="flex items-center gap-2">
                  {brand && <BrandSwatch slot={brand.colorSlot} />}
                  <span className="font-medium">{row.domain}</span>
                  {brand && (
                    <Badge variant="outline" className="font-normal">
                      {brand.kind === "OWN" ? t("you") : brand.name}
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-24 rounded-r-sm bg-muted">
                    <span
                      className="block h-2 rounded-r-sm"
                      style={{
                        width: `${(row.share / max) * 100}%`,
                        background: brand ? slotColor(brand.colorSlot) : "var(--muted-foreground)",
                        opacity: brand ? 1 : 0.55,
                      }}
                    />
                  </span>
                  <span className="text-sm tabular-nums">
                    {formatPercent(row.share, locale, 1, 1)}
                  </span>
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(row.citations, locale)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNumber(row.prompts, locale)}
              </TableCell>
              <TableCell className="pr-6">
                <Platforms platforms={row.platforms} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PageTable({ data, locale }: { data: AiSources; locale: Locale }) {
  const t = useTranslations("aiVisibility.sources");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-6">{t("page")}</TableHead>
          <TableHead className="text-right">{t("citations")}</TableHead>
          <TableHead className="text-right">{t("prompts")}</TableHead>
          <TableHead>{t("platforms")}</TableHead>
          <TableHead className="pr-6">{t("known")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.pages.map((page) => (
          <TableRow key={page.url}>
            <TableCell className="max-w-md pl-6">
              <span className="flex items-center gap-1.5">
                <span className="truncate font-medium" title={page.url}>
                  {page.url.replace(/^https?:\/\//, "")}
                </span>
                <ExternalLinkIcon url={page.url} label={t("openPage")} />
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatNumber(page.citations, locale)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatNumber(page.prompts, locale)}
            </TableCell>
            <TableCell>
              <Platforms platforms={page.platforms} />
            </TableCell>
            <TableCell className="pr-6 text-sm">
              {page.known ? (
                t("knownYes")
              ) : (
                <span className="text-muted-foreground">{t("knownNo")}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
