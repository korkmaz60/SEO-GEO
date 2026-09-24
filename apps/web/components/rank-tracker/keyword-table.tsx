"use client";

import type { Locale, RankChange, TrackedKeyword } from "@seo-geo/contracts";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  CircleAlert,
  Clock,
  Minus,
  Search,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Sparkline } from "@/components/charts/sparkline";
import { Difficulty, IntentBadge } from "@/components/keywords/keyword-metrics";
import { SerpFeatureIcons } from "@/components/keywords/serp-features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCompact, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { BrandRef } from "./brands";

const PAGE_SIZE = 50;

type SortKey = "keyword" | "position" | "change" | "volume" | "difficulty";
type PositionFilter = "all" | "top3" | "top10" | "top30" | "none";
type AiFilter = "all" | "present" | "cited";

/** Positive when the keyword moved up; `null` when there is nothing to compare. */
export function movement(change: RankChange): number | null {
  if (!change) return null;
  if (change.from === null && change.to === null) return null;
  const from = change.from ?? 101;
  const to = change.to ?? 101;
  return from - to;
}

export function ChangeCell({ change }: { change: RankChange }) {
  const t = useTranslations("rankTracker");
  if (!change) return <span className="text-muted-foreground">—</span>;
  if (change.from === null && change.to !== null) {
    return <span className="text-xs font-medium text-positive">{t("new")}</span>;
  }
  if (change.from !== null && change.to === null) {
    return <span className="text-xs font-medium text-negative">{t("lost")}</span>;
  }
  const moved = movement(change);
  if (moved === null) return <span className="text-muted-foreground">—</span>;
  const Icon = moved > 0 ? ArrowUpRight : moved < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        moved > 0 && "text-positive",
        moved < 0 && "text-negative",
        moved === 0 && "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {moved === 0 ? "" : Math.abs(moved)}
      <span className="sr-only">
        {moved > 0 ? t("movedUp") : moved < 0 ? t("movedDown") : t("unchanged")}
      </span>
    </span>
  );
}

export function PositionCell({ keyword }: { keyword: TrackedKeyword }) {
  const t = useTranslations("rankTracker");
  const latest = keyword.latest;
  if (!latest) {
    return keyword.pending ? (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" aria-hidden />
        {t("pending")}
      </span>
    ) : keyword.failed ? (
      <span className="inline-flex items-center gap-1 text-xs text-critical">
        <CircleAlert className="size-3.5" aria-hidden />
        {t("failed")}
      </span>
    ) : (
      <span className="text-muted-foreground">—</span>
    );
  }
  if (latest.position === null) {
    return (
      <span className="text-sm text-muted-foreground">
        {t("notRanking", { depth: latest.depth })}
      </span>
    );
  }
  return <span className="text-base font-semibold tabular-nums">{latest.position}</span>;
}

function SortHeader({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; direction: 1 | -1 };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.direction === 1 ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.direction === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </button>
    </TableHead>
  );
}

interface KeywordTableProps {
  keywords: TrackedKeyword[];
  brands: BrandRef[];
  canEdit: boolean;
  onOpen: (keywordId: string) => void;
  onDelete: (ids: string[]) => void;
}

/** Tracked keywords with filters, sorting, pagination and bulk removal. */
export function KeywordTable({ keywords, brands, canEdit, onOpen, onDelete }: KeywordTableProps) {
  const t = useTranslations("rankTracker.table");
  const tr = useTranslations("rankTracker");
  const locale = useLocale() as Locale;
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("all");
  const [positionFilter, setPositionFilter] = useState<PositionFilter>("all");
  const [aiFilter, setAiFilter] = useState<AiFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({
    key: "position",
    direction: 1,
  });
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const competitors = brands.filter((brand) => brand.kind === "COMPETITOR").slice(0, 3);

  const tags = useMemo(
    () =>
      [...new Set(keywords.flatMap((keyword) => keyword.tags))].sort((a, b) =>
        a.localeCompare(b, locale),
      ),
    [keywords, locale],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    const filtered = keywords.filter((keyword) => {
      if (needle && !keyword.keyword.includes(needle)) return false;
      if (tag !== "all" && !keyword.tags.includes(tag)) return false;
      const position = keyword.latest?.position ?? null;
      if (positionFilter === "top3" && !(position !== null && position <= 3)) return false;
      if (positionFilter === "top10" && !(position !== null && position <= 10)) return false;
      if (positionFilter === "top30" && !(position !== null && position <= 30)) return false;
      if (positionFilter === "none" && !(keyword.latest && position === null)) return false;
      if (aiFilter === "present" && !keyword.latest?.aiOverviewPresent) return false;
      if (aiFilter === "cited" && !keyword.latest?.aiOverviewCited) return false;
      return true;
    });
    const value = (keyword: TrackedKeyword): number | string | null => {
      switch (sort.key) {
        case "keyword":
          return keyword.keyword;
        case "position":
          return keyword.latest?.position ?? null;
        case "change":
          return movement(keyword.changes.previous);
        case "volume":
          return keyword.metrics?.searchVolume ?? null;
        case "difficulty":
          return keyword.metrics?.keywordDifficulty ?? null;
      }
    };
    return filtered.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      // Missing values always sort last.
      if (left === null && right === null) return a.keyword.localeCompare(b.keyword, locale);
      if (left === null) return 1;
      if (right === null) return -1;
      const order =
        typeof left === "string" && typeof right === "string"
          ? left.localeCompare(right, locale)
          : Number(left) - Number(right);
      return order * sort.direction || a.keyword.localeCompare(b.keyword, locale);
    });
  }, [keywords, search, tag, positionFilter, aiFilter, sort, locale]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(row.id));

  function toggleSort(key: SortKey) {
    setSort((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === 1 ? -1 : 1 }
        : { key, direction: key === "volume" || key === "change" ? -1 : 1 },
    );
  }

  function toggle(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const positionItems = (["all", "top3", "top10", "top30", "none"] as const).map((value) => ({
    value,
    label: tr(`positionFilter.${value}`),
  }));
  const aiItems = (["all", "present", "cited"] as const).map((value) => ({
    value,
    label: tr(`aiFilter.${value}`),
  }));
  const tagItems = [
    { value: "all", label: t("allTags") },
    ...tags.map((value) => ({ value, label: value })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </InputGroup>
        <Select
          items={positionItems}
          value={positionFilter}
          onValueChange={(value) => {
            if (value) {
              setPositionFilter(value as PositionFilter);
              setPage(0);
            }
          }}
        >
          <SelectTrigger size="sm" aria-label={t("position")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {positionItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          items={aiItems}
          value={aiFilter}
          onValueChange={(value) => {
            if (value) {
              setAiFilter(value as AiFilter);
              setPage(0);
            }
          }}
        >
          <SelectTrigger size="sm" aria-label={tr("aiFilter.label")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {aiItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tags.length > 0 && (
          <Select
            items={tagItems}
            value={tag}
            onValueChange={(value) => {
              if (value) {
                setTag(value);
                setPage(0);
              }
            }}
          >
            <SelectTrigger size="sm" aria-label={t("tags")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tagItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <span className="text-sm text-muted-foreground sm:ml-auto">
          {t("count", { shown: rows.length, total: keywords.length })}
        </span>
        {canEdit && selected.size > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onDelete([...selected]);
              setSelected(new Set());
            }}
          >
            <Trash2 />
            {t("deleteSelected", { count: selected.size })}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label={t("selectPage")}
                    checked={allVisibleSelected}
                    onChange={() =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        for (const row of visible) {
                          if (allVisibleSelected) next.delete(row.id);
                          else next.add(row.id);
                        }
                        return next;
                      })
                    }
                  />
                </TableHead>
              )}
              <SortHeader
                label={t("keyword")}
                column="keyword"
                sort={sort}
                onSort={toggleSort}
                className="min-w-56"
              />
              <SortHeader
                label={t("position")}
                column="position"
                sort={sort}
                onSort={toggleSort}
                className="text-right"
              />
              <SortHeader label={t("change")} column="change" sort={sort} onSort={toggleSort} />
              <TableHead>{t("week")}</TableHead>
              <TableHead>{t("month")}</TableHead>
              <TableHead>{t("trend")}</TableHead>
              <TableHead>{t("features")}</TableHead>
              {competitors.map((brand) => (
                <TableHead
                  key={brand.id}
                  className="max-w-24 truncate text-right"
                  title={brand.name}
                >
                  {brand.name}
                </TableHead>
              ))}
              <SortHeader
                label={t("volume")}
                column="volume"
                sort={sort}
                onSort={toggleSort}
                className="text-right"
              />
              <SortHeader
                label={t("difficulty")}
                column="difficulty"
                sort={sort}
                onSort={toggleSort}
              />
              <TableHead>{t("intent")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={11 + competitors.length}
                  className="py-10 text-center text-muted-foreground"
                >
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((keyword) => {
                const latest = keyword.latest;
                const wrongUrl =
                  keyword.targetUrl && latest?.url && latest.url !== keyword.targetUrl
                    ? latest.url
                    : null;
                return (
                  <TableRow
                    key={keyword.id}
                    className="cursor-pointer"
                    onClick={() => onOpen(keyword.id)}
                  >
                    {canEdit && (
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          aria-label={t("select", { keyword: keyword.keyword })}
                          checked={selected.has(keyword.id)}
                          onChange={() => toggle(keyword.id)}
                        />
                      </TableCell>
                    )}
                    <TableCell className="max-w-80">
                      <div className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          {keyword.keyword}
                          {keyword.device === "MOBILE" && (
                            <Smartphone
                              className="size-3.5 text-muted-foreground"
                              aria-label={tr("mobile")}
                            />
                          )}
                        </span>
                        {latest?.url && (
                          <span className="flex min-w-0 items-center gap-1">
                            <span
                              className="truncate text-xs text-muted-foreground"
                              title={latest.url}
                            >
                              {latest.url.replace(/^https?:\/\/(www\.)?/, "")}
                            </span>
                            {wrongUrl && (
                              <Tooltip>
                                <TooltipTrigger render={<span />} className="shrink-0 text-warning">
                                  <CircleAlert className="size-3.5" aria-hidden />
                                  <span className="sr-only">
                                    {tr("wrongUrl", { url: keyword.targetUrl ?? "" })}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {tr("wrongUrl", { url: keyword.targetUrl ?? "" })}
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        )}
                        {keyword.tags.length > 0 && (
                          <span className="flex flex-wrap gap-1">
                            {keyword.tags.map((value) => (
                              <Badge
                                key={value}
                                variant="secondary"
                                className="px-1.5 py-0 text-[11px] font-normal"
                              >
                                {value}
                              </Badge>
                            ))}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <PositionCell keyword={keyword} />
                    </TableCell>
                    <TableCell>
                      <ChangeCell change={keyword.changes.previous} />
                    </TableCell>
                    <TableCell>
                      <ChangeCell change={keyword.changes.week} />
                    </TableCell>
                    <TableCell>
                      <ChangeCell change={keyword.changes.month} />
                    </TableCell>
                    <TableCell>
                      <Sparkline
                        values={keyword.history.map((point) => point.position)}
                        invert
                        label={tr("trendLabel", { keyword: keyword.keyword })}
                      />
                    </TableCell>
                    <TableCell>
                      {latest ? (
                        <SerpFeatureIcons
                          features={latest.serpFeatures}
                          owned={latest.ownedFeatures}
                          aiOverviewCited={latest.aiOverviewCited}
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {competitors.map((brand) => {
                      const position = keyword.competitors[brand.id];
                      return (
                        <TableCell
                          key={brand.id}
                          className="text-right tabular-nums text-muted-foreground"
                        >
                          {latest ? (position ?? "—") : ""}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right tabular-nums">
                      {keyword.metrics?.searchVolume != null
                        ? formatCompact(keyword.metrics.searchVolume, locale)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Difficulty value={keyword.metrics?.keywordDifficulty ?? null} />
                    </TableCell>
                    <TableCell>
                      <IntentBadge intent={keyword.metrics?.intent ?? null} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {t("page", {
              page: formatNumber(current + 1, locale),
              pages: formatNumber(pages, locale),
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}
