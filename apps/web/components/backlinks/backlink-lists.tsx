"use client";

import type { Backlink, BacklinkAnchor, Locale, ReferringDomain } from "@seo-geo/contracts";
import { CircleAlert, Image as ImageIcon, Link2, Network, Type } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { ExternalLinkIcon } from "@/components/data/external-link";
import { SortHeader, compareValues, nextSort, type SortState } from "@/components/data/sort-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { pathOf } from "@/lib/domain";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";

interface TopRows<T> {
  total: number;
  items: T[];
}

function time(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

/** Case-insensitive, Turkish-aware match of `needle` in any of the texts. */
function matches(texts: (string | null)[], needle: string, locale: Locale): boolean {
  return texts.some((text) => text?.toLocaleLowerCase(locale).includes(needle));
}

/** A 0–100 value (rank, spam score) as a short bar and its number. */
export function ScaleBar({ value, locale }: { value: number | null; locale: Locale }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="grid grid-cols-[3rem_2rem] items-center gap-2">
      <span className="h-2 rounded-r-sm bg-muted">
        <span
          className="block h-2 rounded-r-sm"
          style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: "var(--chart-1)" }}
        />
      </span>
      <span className="text-right tabular-nums">{formatNumber(value, locale)}</span>
    </span>
  );
}

/** The filter box above a list and what it shows. */
function ListToolbar({
  search,
  onSearch,
  summary,
}: {
  search: string;
  onSearch: (value: string) => void;
  summary: string;
}) {
  const t = useTranslations("backlinks.lists");
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Input
        className="w-full sm:w-64"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        placeholder={t("filter")}
        aria-label={t("filter")}
      />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {summary}
      </p>
    </div>
  );
}

function useListState<K extends string>(initial: SortState<K>) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<K>>(initial);
  return { search, setSearch, sort, setSort };
}

type DomainSort = "domain" | "rank" | "backlinks" | "spamScore" | "firstSeen";

/** The referring domains passing the most rank. */
export function ReferringDomainsTable({ list }: { list: TopRows<ReferringDomain> }) {
  const t = useTranslations("backlinks.referringDomains");
  const tl = useTranslations("backlinks.lists");
  const locale = useLocale() as Locale;
  const { search, setSearch, sort, setSort } = useListState<DomainSort>({
    key: "rank",
    direction: -1,
  });
  const needle = search.trim().toLocaleLowerCase(locale);
  const rows = useMemo(() => {
    const value = (row: ReferringDomain): number | string | null =>
      sort.key === "firstSeen" ? time(row.firstSeen) : row[sort.key];
    return list.items
      .filter((row) => !needle || matches([row.domain], needle, locale))
      .sort((a, b) => compareValues(value(a), value(b), sort.direction, locale));
  }, [list.items, needle, sort, locale]);

  if (list.items.length === 0) {
    return (
      <EmptyState
        icon={Network}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        size="compact"
      />
    );
  }
  const header = (label: string, key: DomainSort, className?: string) => (
    <SortHeader
      label={label}
      column={key}
      sort={sort}
      onSort={(column) =>
        setSort((previous) =>
          nextSort(previous, column, (next) =>
            next === "domain" || next === "spamScore" ? 1 : -1,
          ),
        )
      }
      className={className}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        summary={
          needle
            ? tl("matches", { count: rows.length, shown: list.items.length })
            : t("summary", {
                shown: formatNumber(list.items.length, locale),
                total: formatNumber(list.total, locale),
              })
        }
      />
      <div className="max-h-[36rem] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {header(t("columns.domain"), "domain", "min-w-52")}
              {header(t("columns.rank"), "rank")}
              {header(t("columns.backlinks"), "backlinks", "text-right")}
              {header(t("columns.spamScore"), "spamScore", "text-right")}
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
              rows.map((row) => (
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
                    <ScaleBar value={row.rank} locale={locale} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.backlinks, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.spamScore !== null ? formatNumber(row.spamScore, locale) : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.firstSeen ? formatDate(row.firstSeen, locale) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type BacklinkSort = "domainRank" | "firstSeen";

/** The strongest link of each of the strongest referring domains. */
export function BacklinksTable({ list }: { list: TopRows<Backlink> }) {
  const t = useTranslations("backlinks.backlinkList");
  const tl = useTranslations("backlinks.lists");
  const locale = useLocale() as Locale;
  const { search, setSearch, sort, setSort } = useListState<BacklinkSort>({
    key: "domainRank",
    direction: -1,
  });
  const needle = search.trim().toLocaleLowerCase(locale);
  const rows = useMemo(() => {
    const value = (row: Backlink) =>
      sort.key === "firstSeen" ? time(row.firstSeen) : row.domainRank;
    return list.items
      .filter(
        (row) =>
          !needle ||
          matches(
            [row.domainFrom, row.urlFrom, row.pageTitle, row.anchor, row.urlTo],
            needle,
            locale,
          ),
      )
      .sort((a, b) => compareValues(value(a), value(b), sort.direction, locale));
  }, [list.items, needle, sort, locale]);

  if (list.items.length === 0) {
    return (
      <EmptyState
        icon={Link2}
        title={t("emptyTitle")}
        description={t("emptyBody")}
        size="compact"
      />
    );
  }
  const header = (label: string, key: BacklinkSort, className?: string) => (
    <SortHeader
      label={label}
      column={key}
      sort={sort}
      onSort={(column) => setSort((previous) => nextSort(previous, column, () => -1))}
      className={className}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        summary={
          needle
            ? tl("matches", { count: rows.length, shown: list.items.length })
            : t("summary", {
                shown: formatNumber(list.items.length, locale),
                total: formatNumber(list.total, locale),
              })
        }
      />
      <div className="max-h-[36rem] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead className="min-w-64">{t("columns.source")}</TableHead>
              <TableHead className="min-w-44">{t("columns.anchor")}</TableHead>
              <TableHead className="min-w-36">{t("columns.target")}</TableHead>
              {header(t("columns.domainRank"), "domainRank")}
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
              rows.map((row) => (
                <TableRow key={`${row.urlFrom}|${row.urlTo}`}>
                  <TableCell>
                    <span className="flex max-w-80 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium" title={row.pageTitle ?? row.urlFrom}>
                          {row.pageTitle ?? row.domainFrom}
                        </span>
                        <ExternalLinkIcon url={row.urlFrom} label={t("open")} />
                      </span>
                      <span className="truncate text-xs text-muted-foreground" title={row.urlFrom}>
                        {row.domainFrom}
                        {pathOf(row.urlFrom)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex max-w-64 flex-wrap items-center gap-1.5">
                      {row.type === "image" && (
                        <>
                          <ImageIcon className="size-3.5 text-muted-foreground" aria-hidden />
                          <span className="sr-only">{t("image")}</span>
                        </>
                      )}
                      {row.anchor?.trim() ? (
                        <span className="truncate" title={row.anchor}>
                          {row.anchor}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">{t("noAnchor")}</span>
                      )}
                      {!row.dofollow && (
                        <Badge variant="outline" className="font-normal">
                          nofollow
                        </Badge>
                      )}
                      {row.isNew && <Badge variant="secondary">{t("new")}</Badge>}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex max-w-56 items-center gap-1.5">
                      <span className="truncate text-muted-foreground" title={row.urlTo}>
                        {pathOf(row.urlTo)}
                      </span>
                      {row.isBroken && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-critical">
                          <CircleAlert className="size-3.5" aria-hidden />
                          {t("broken")}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ScaleBar value={row.domainRank} locale={locale} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.firstSeen ? formatDate(row.firstSeen, locale) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

type AnchorSort = "anchor" | "referringDomains" | "backlinks" | "firstSeen";

/** Anchor texts used by the most referring domains; bar length is the domain count. */
export function AnchorsTable({ list }: { list: TopRows<BacklinkAnchor> }) {
  const t = useTranslations("backlinks.anchors");
  const tl = useTranslations("backlinks.lists");
  const locale = useLocale() as Locale;
  const { search, setSearch, sort, setSort } = useListState<AnchorSort>({
    key: "referringDomains",
    direction: -1,
  });
  const needle = search.trim().toLocaleLowerCase(locale);
  const max = Math.max(1, ...list.items.map((row) => row.referringDomains));
  const rows = useMemo(() => {
    const value = (row: BacklinkAnchor): number | string | null =>
      sort.key === "firstSeen" ? time(row.firstSeen) : row[sort.key];
    return list.items
      .filter((row) => !needle || matches([row.anchor], needle, locale))
      .sort((a, b) => compareValues(value(a), value(b), sort.direction, locale));
  }, [list.items, needle, sort, locale]);

  if (list.items.length === 0) {
    return (
      <EmptyState icon={Type} title={t("emptyTitle")} description={t("emptyBody")} size="compact" />
    );
  }
  const header = (label: string, key: AnchorSort, className?: string) => (
    <SortHeader
      label={label}
      column={key}
      sort={sort}
      onSort={(column) =>
        setSort((previous) => nextSort(previous, column, (next) => (next === "anchor" ? 1 : -1)))
      }
      className={className}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      <ListToolbar
        search={search}
        onSearch={setSearch}
        summary={
          needle
            ? tl("matches", { count: rows.length, shown: list.items.length })
            : t("summary", {
                shown: formatNumber(list.items.length, locale),
                total: formatNumber(list.total, locale),
              })
        }
      />
      <div className="max-h-[36rem] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {header(t("columns.anchor"), "anchor", "min-w-52")}
              {header(t("columns.referringDomains"), "referringDomains", "min-w-48")}
              {header(t("columns.backlinks"), "backlinks", "text-right")}
              <TableHead className="text-right">{t("columns.nofollow")}</TableHead>
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
              rows.map((row) => (
                <TableRow key={row.anchor}>
                  <TableCell>
                    {row.anchor.trim() ? (
                      <span className="line-clamp-2 max-w-80 font-medium" title={row.anchor}>
                        {row.anchor}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">{t("noText")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="grid grid-cols-[1fr_3.5rem] items-center gap-2">
                      <span className="h-2 rounded-r-sm bg-muted">
                        <span
                          className="block h-2 rounded-r-sm"
                          style={{
                            width: `${(row.referringDomains / max) * 100}%`,
                            background: "var(--chart-1)",
                          }}
                        />
                      </span>
                      <span className="text-right tabular-nums">
                        {formatNumber(row.referringDomains, locale)}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(row.backlinks, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.referringDomains > 0
                      ? formatPercent(row.nofollowDomains / row.referringDomains, locale, 0)
                      : "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {row.firstSeen ? formatDate(row.firstSeen, locale) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
