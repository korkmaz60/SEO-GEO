"use client";

import {
  AuditPageListSchema,
  type AuditPageFilter,
  type AuditPageRow,
  type Locale,
} from "@seo-geo/contracts";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleX, Info, Search, TriangleAlert } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

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
import { apiGet } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";

const PAGE_SIZE = 50;
const FILTERS = ["all", "errors", "warnings", "broken", "redirects", "noindex"] as const;

function StatusCell({ page }: { page: AuditPageRow }) {
  const t = useTranslations("siteAudit.pages");
  if (page.fetchError) {
    return (
      <span className="text-xs text-muted-foreground">
        {page.fetchError === "blocked_by_robots"
          ? t("blocked")
          : t("failedFetch", { reason: page.fetchError })}
      </span>
    );
  }
  const status = page.statusCode ?? 0;
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
        status >= 500 || (status >= 400 && status < 500)
          ? "bg-critical/10 text-critical"
          : status >= 300
            ? "bg-warning/15 text-foreground"
            : "bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

export function AuditPages({ projectId, runId }: { projectId: string; runId: string }) {
  const t = useTranslations("siteAudit.pages");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const [filter, setFilter] = useState<AuditPageFilter>("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const params = new URLSearchParams({ filter, limit: String(PAGE_SIZE), offset: String(offset) });
  if (debouncedSearch) params.set("search", debouncedSearch);
  const pages = useQuery({
    queryKey: ["site-audit", projectId, runId, "pages", params.toString()],
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/projects/${projectId}/site-audit/runs/${runId}/pages?${params}`,
        AuditPageListSchema,
        { signal },
      ),
    placeholderData: keepPreviousData,
  });
  const filterItems = FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }));
  const total = pages.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="w-full sm:w-72">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
            placeholder={t("search")}
            aria-label={t("search")}
          />
        </InputGroup>
        <Select
          items={filterItems}
          value={filter}
          onValueChange={(value) => {
            if (value) {
              setFilter(value as AuditPageFilter);
              setOffset(0);
            }
          }}
        >
          <SelectTrigger size="sm" aria-label={t("filter")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filterItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground sm:ml-auto">
          {t("count", { count: total })}
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-72">{t("url")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("issues")}</TableHead>
              <TableHead className="text-right">{t("depth")}</TableHead>
              <TableHead className="text-right">{t("inlinks")}</TableHead>
              <TableHead className="text-right">{t("words")}</TableHead>
              <TableHead className="text-right">{t("responseTime")}</TableHead>
              <TableHead>{t("indexable")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.data?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  {t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              pages.data?.data.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="max-w-md">
                    <p className="truncate font-medium" title={page.url}>
                      {page.url.replace(/^https?:\/\//, "")}
                    </p>
                    {page.title && (
                      <p className="truncate text-xs text-muted-foreground">{page.title}</p>
                    )}
                    {page.redirectTarget && (
                      <p className="truncate text-xs text-muted-foreground">
                        → {page.redirectTarget}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusCell page={page} />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-xs tabular-nums">
                      {page.issues.errors > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-critical">
                          <CircleX className="size-3.5" aria-label={t("errors")} />
                          {page.issues.errors}
                        </span>
                      )}
                      {page.issues.warnings > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-warning">
                          <TriangleAlert className="size-3.5" aria-label={t("warnings")} />
                          <span className="text-foreground">{page.issues.warnings}</span>
                        </span>
                      )}
                      {page.issues.notices > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                          <Info className="size-3.5" aria-label={t("notices")} />
                          {page.issues.notices}
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {page.depth < 0 ? "—" : page.depth}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(page.inlinks, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {page.wordCount !== null ? formatNumber(page.wordCount, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {page.loadMs !== null ? `${formatNumber(page.loadMs, locale)} ms` : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {page.indexable ? (
                      t("yes")
                    ) : (
                      <span className="text-muted-foreground">{t("no")}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">
            {t("range", {
              from: formatNumber(offset + 1, locale),
              to: formatNumber(Math.min(offset + PAGE_SIZE, total), locale),
              total: formatNumber(total, locale),
            })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            {t("previous")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            {t("next")}
          </Button>
        </div>
      )}
    </div>
  );
}
