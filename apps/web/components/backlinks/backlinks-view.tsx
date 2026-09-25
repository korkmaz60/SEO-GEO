"use client";

import {
  ProjectBacklinksSchema,
  ProjectBacklinksStateSchema,
  type Locale,
  type ProjectBacklinksState,
} from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Link2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { usageQueryKey } from "@/components/app-shell/usage-meter";
import { EmptyState } from "@/components/data/empty-state";
import { RefreshDataButton } from "@/components/data/refresh-data";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiGet, apiSend, errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatUsd } from "@/lib/format";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { BacklinkCompetitorsPanel } from "./backlink-competitors";
import { AnchorsTable, BacklinksTable, ReferringDomainsTable } from "./backlink-lists";
import { BacklinksReport } from "./backlinks-report";
import { backlinkCompetitorsKey, backlinksKey } from "./queries";

const TABS = ["referring-domains", "backlinks", "anchors", "competitors"] as const;
type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "referring-domains";

/**
 * The project's backlinks (docs/frontend.md): cached data opens for free, for viewers too;
 * loading or refreshing it shows the cost first (D23). The open tab lives in the URL
 * (`?tab=anchors`).
 */
export function BacklinksView() {
  const t = useTranslations("backlinks");
  const tp = useTranslations("pages.backlinks");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canRun = useCan("member");
  const isAdmin = useCan("admin");
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab") ?? "";
  const tab: Tab = (TABS as readonly string[]).includes(requested)
    ? (requested as Tab)
    : DEFAULT_TAB;

  const projectId = project?.id ?? "";
  const path = `/workspaces/${workspace.id}/projects/${projectId}/backlinks`;
  const state = useQuery({
    queryKey: backlinksKey(projectId),
    queryFn: ({ signal }) => apiGet(path, ProjectBacklinksStateSchema, { signal }),
    enabled: project !== null,
  });
  const load = useMutation({
    mutationFn: (refresh: boolean) => apiSend("POST", path, { refresh }, ProjectBacklinksSchema),
    onSuccess: (report) => {
      queryClient.setQueryData<ProjectBacklinksState>(backlinksKey(projectId), (previous) =>
        previous ? { ...previous, report, estimatedCostUsd: 0 } : previous,
      );
      void queryClient.invalidateQueries({ queryKey: usageQueryKey(workspace.id) });
      // The comparison shares the project's backlink summary.
      void queryClient.invalidateQueries({ queryKey: backlinkCompetitorsKey(projectId) });
    },
  });

  function selectTab(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_TAB) params.delete("tab");
    else params.set("tab", next);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname);
  }

  if (!project) return null;
  const data = state.data;
  const report = data?.report ?? null;
  const missingProvider =
    load.error instanceof ApiError &&
    load.error.status === 409 &&
    load.error.problem?.code === "provider_error";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader title={tp("title")} description={tp("description")} />

      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("failed")}</AlertTitle>
          <AlertDescription>{errorMessage(state.error, t("failed"))}</AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" onClick={() => void state.refetch()}>
              {t("retry")}
            </Button>
          </AlertAction>
        </Alert>
      ) : !data ? (
        <ReportSkeleton label={null} />
      ) : report ? (
        <>
          <BacklinksReport
            report={report}
            actions={
              canRun && (
                <RefreshDataButton
                  fetchedAt={report.source.fetchedAt}
                  costUsd={data.refreshCostUsd}
                  disabled={load.isPending}
                  onRefresh={() => load.mutateAsync(true)}
                />
              )
            }
          />
          <Card>
            <CardContent>
              <Tabs value={tab} onValueChange={(value) => selectTab(String(value))}>
                <TabsList className="h-auto flex-wrap justify-start">
                  {TABS.map((value) => (
                    <TabsTrigger key={value} value={value}>
                      {t(`tabs.${value}`)}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <TabsContent value="referring-domains" className="mt-4">
                  <ReferringDomainsTable list={report.referringDomains} />
                </TabsContent>
                <TabsContent value="backlinks" className="mt-4">
                  <BacklinksTable list={report.backlinks} />
                </TabsContent>
                <TabsContent value="anchors" className="mt-4">
                  <AnchorsTable list={report.anchors} />
                </TabsContent>
                <TabsContent value="competitors" className="mt-4">
                  <BacklinkCompetitorsPanel project={project} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("provenance", { date: formatDateTime(report.source.fetchedAt, locale) })}
            {report.profile?.firstSeen &&
              ` ${t("firstSeen", {
                domain: report.target,
                date: formatDate(report.profile.firstSeen, locale),
              })}`}
          </p>
        </>
      ) : load.isPending ? (
        <ReportSkeleton label={t("loading", { domain: data.target })} />
      ) : (
        <>
          {load.error &&
            (missingProvider ? (
              <Alert>
                <KeyRound aria-hidden />
                <AlertTitle>{t("providerMissing.title")}</AlertTitle>
                <AlertDescription>
                  {isAdmin ? t("providerMissing.body") : t("providerMissing.askAdmin")}
                </AlertDescription>
                {isAdmin && (
                  <AlertAction>
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<Link href={`/${workspace.slug}/settings/providers`} />}
                    >
                      {t("providerMissing.action")}
                    </Button>
                  </AlertAction>
                )}
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertTitle>{t("failed")}</AlertTitle>
                <AlertDescription>{errorMessage(load.error, t("failed"))}</AlertDescription>
              </Alert>
            ))}
          {canRun ? (
            <Card>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">{t("load.title", { domain: data.target })}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("load.body", { cost: formatUsd(data.estimatedCostUsd, locale) })}
                  </p>
                </div>
                <Button className="shrink-0" onClick={() => load.mutate(false)}>
                  <Link2 />
                  {t("load.run", { cost: formatUsd(data.estimatedCostUsd, locale) })}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <EmptyState
              icon={Link2}
              title={t("load.viewerTitle")}
              description={t("load.viewerBody", { domain: data.target })}
            />
          )}
        </>
      )}
    </div>
  );
}

function ReportSkeleton({ label }: { label: string | null }) {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      {label && (
        <p className="text-sm text-muted-foreground" role="status">
          {label}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}
