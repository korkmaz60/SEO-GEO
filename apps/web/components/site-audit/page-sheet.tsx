"use client";

import { AuditPageDetailSchema, isIssueCode, type Locale } from "@seo-geo/contracts";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { ExternalLinkIcon } from "@/components/data/external-link";
import { ScoreRing } from "@/components/data/score-ring";
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

import { CitabilityFactors } from "./citability";
import { SeverityIcon } from "./issue-severity";

interface PageSheetProps {
  projectId: string;
  runId: string;
  pageId: string | null;
  onClose: () => void;
}

/** A crawled page: its facts, issues and how easily AI answers can quote it. */
export function PageSheet({ projectId, runId, pageId, onClose }: PageSheetProps) {
  const t = useTranslations("siteAudit.pageDetail");
  const ti = useTranslations("siteAudit.issues");
  const tc = useTranslations("siteAudit.citability");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const detail = useQuery({
    queryKey: ["site-audit", projectId, runId, "page", pageId],
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/projects/${projectId}/site-audit/runs/${runId}/pages/${pageId}`,
        AuditPageDetailSchema,
        { signal },
      ),
    enabled: pageId !== null,
  });
  const data = detail.data;
  const page = data?.page;

  return (
    <Sheet open={pageId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2 pr-8 text-base break-all">
            {page ? page.url.replace(/^https?:\/\//, "") : " "}
            {page && <ExternalLinkIcon url={page.url} label={t("open")} />}
          </SheetTitle>
          <SheetDescription>{page?.title ?? " "}</SheetDescription>
        </SheetHeader>

        {!data || !page ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6 p-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Fact label={t("status")}>{page.statusCode ?? page.fetchError ?? "—"}</Fact>
              <Fact label={t("indexable")}>{page.indexable ? t("yes") : t("no")}</Fact>
              <Fact label={t("words")}>
                {page.wordCount !== null ? formatNumber(page.wordCount, locale) : "—"}
              </Fact>
              <Fact label={t("inlinks")}>{formatNumber(page.inlinks, locale)}</Fact>
              <Fact label={t("outlinks")}>{formatNumber(page.outlinks, locale)}</Fact>
              <Fact label={t("externalLinks")}>{formatNumber(page.externalLinks, locale)}</Fact>
              <Fact label={t("size")}>
                {page.bytes !== null ? formatBytes(page.bytes, locale) : "—"}
              </Fact>
              <Fact label={t("lang")}>{page.lang ?? "—"}</Fact>
            </dl>
            {(page.h1 || page.schemaTypes.length > 0) && (
              <dl className="grid gap-2 text-sm">
                {page.h1 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("h1")}</dt>
                    <dd>{page.h1}</dd>
                  </div>
                )}
                {page.schemaTypes.length > 0 && (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("schema")}</dt>
                    <dd>{page.schemaTypes.join(", ")}</dd>
                  </div>
                )}
              </dl>
            )}

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">{tc("title")}</h3>
              {data.citability ? (
                <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                  <ScoreRing score={data.citability.score} label={tc("pageScore")} size={96} />
                  <CitabilityFactors
                    factors={data.citability.factors}
                    recommendations={data.citability.recommendations}
                  />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("notScored")}</p>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">{t("issues", { count: data.issues.length })}</h3>
              {data.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noIssues")}</p>
              ) : (
                <ul className="flex flex-col divide-y rounded-lg border">
                  {data.issues.map((issue) =>
                    isIssueCode(issue.code) ? (
                      <li key={issue.code} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                        <SeverityIcon severity={issue.severity} />
                        <span className="min-w-0">
                          <span className="block font-medium">{ti(`${issue.code}.title`)}</span>
                          <span className="block text-xs text-muted-foreground">
                            {ti(`${issue.code}.fix`)}
                          </span>
                        </span>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}
