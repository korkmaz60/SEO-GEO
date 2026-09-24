"use client";

import {
  AuditIssueOccurrenceSchema,
  ISSUE_CATALOG,
  isIssueCode,
  type AuditIssueOccurrence,
  type IssueCode,
  type Locale,
} from "@seo-geo/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";

import { ExternalLinkIcon } from "@/components/data/external-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet } from "@/lib/api";
import { formatBytes, formatNumber } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";

import { SeverityIcon } from "./issue-severity";

const PAGE_SIZE = 50;
const OccurrencesSchema = z.object({ data: z.array(AuditIssueOccurrenceSchema), total: z.int() });

/** Numeric facts an issue records, shown under the page (lengths, counts, timings). */
const NUMBER_DETAILS = [
  "status",
  "length",
  "words",
  "count",
  "images",
  "hops",
  "depth",
  "ms",
  "bytes",
] as const;

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function IssueSheet({
  projectId,
  runId,
  code,
  onClose,
}: {
  projectId: string;
  runId: string;
  code: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("siteAudit");
  const ti = useTranslations("siteAudit.issues");
  const td = useTranslations("siteAudit.detail");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const known: IssueCode | null = code && isIssueCode(code) ? code : null;
  const occurrences = useInfiniteQuery({
    queryKey: ["site-audit", projectId, runId, "issue", code],
    queryFn: ({ pageParam, signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/projects/${projectId}/site-audit/runs/${runId}/issues/${code}?limit=${PAGE_SIZE}&offset=${pageParam}`,
        OccurrencesSchema,
        { signal },
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.data.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: code !== null,
  });
  const rows = occurrences.data?.pages.flatMap((page) => page.data) ?? [];
  const total = occurrences.data?.pages[0]?.total ?? 0;
  const definition = known ? ISSUE_CATALOG[known] : null;

  function details(occurrence: AuditIssueOccurrence): string[] {
    const { data } = occurrence;
    const parts: string[] = [];
    for (const key of NUMBER_DETAILS) {
      const value = data[key];
      if (typeof value !== "number") continue;
      parts.push(
        td(key, {
          value: key === "bytes" ? formatBytes(value, locale) : formatNumber(value, locale),
        }),
      );
    }
    if (typeof data.reason === "string") parts.push(td("reason", { reason: data.reason }));
    if (typeof data.canonical === "string") parts.push(td("canonical", { url: data.canonical }));
    const bots = stringList(data.bots);
    if (bots.length > 0) parts.push(td("bots", { bots: bots.join(", ") }));
    return parts;
  }

  return (
    <Sheet open={code !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-start gap-2 pr-8 text-lg">
            {definition && <SeverityIcon severity={definition.severity} />}
            {known ? ti(`${known}.title`) : code}
          </SheetTitle>
          <SheetDescription render={<div />} className="flex flex-wrap gap-2 pt-1">
            {definition && (
              <>
                <Badge variant="outline">{t(`severity.${definition.severity}`)}</Badge>
                <Badge variant="outline">{t(`categories.${definition.category}`)}</Badge>
              </>
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-5 p-4">
          {known && (
            <>
              <section className="space-y-1.5">
                <h3 className="text-sm font-medium">{t("why")}</h3>
                <p className="text-sm text-muted-foreground">{ti(`${known}.description`)}</p>
              </section>
              <section className="space-y-1.5">
                <h3 className="text-sm font-medium">{t("howToFix")}</h3>
                <p className="text-sm text-muted-foreground">{ti(`${known}.fix`)}</p>
              </section>
            </>
          )}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t("affected", { count: total })}</h3>
            {!occurrences.data ? (
              <Skeleton className="h-40" />
            ) : (
              <ul className="divide-y rounded-lg border text-sm">
                {rows.map((row, index) => (
                  <li
                    key={`${row.pageId ?? "site"}-${index}`}
                    className="flex items-start gap-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{row.url ?? t("siteWide")}</p>
                      {details(row).length > 0 && (
                        <p className="truncate text-xs text-muted-foreground">
                          {details(row).join(" · ")}
                        </p>
                      )}
                      {[...stringList(row.data.urls), ...stringList(row.data.chain)].length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          {[...stringList(row.data.urls), ...stringList(row.data.chain)].map(
                            (url, position) => (
                              <li key={`${url}-${position}`} className="truncate">
                                → {url}
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </div>
                    <ExternalLinkIcon url={row.url} label={t("openPage")} className="mt-0.5" />
                  </li>
                ))}
              </ul>
            )}
            {occurrences.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void occurrences.fetchNextPage()}
                disabled={occurrences.isFetchingNextPage}
              >
                {t("showMore")}
              </Button>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
