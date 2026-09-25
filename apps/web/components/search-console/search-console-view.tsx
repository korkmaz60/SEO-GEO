"use client";

import {
  GoogleIntegrationsSchema,
  PerformanceDataSchema,
  type Locale,
  type PerformanceData,
  type Project,
  type ProjectIntegration,
} from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  CircleAlert,
  CircleCheck,
  KeyRound,
  Loader2,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/page-header";
import { GOOGLE_CLIENT_SECTION_ID } from "@/components/settings/google-oauth-client";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { AnalyticsPerformance } from "./analytics-performance";
import { SearchPerformance } from "./search-performance";
import { connectGoogle, googleStatusKey, siteLabel, SourcesDialog } from "./sources-dialog";

const RANGES = ["7", "28", "90"] as const;
type Range = (typeof RANGES)[number];
const OAUTH_RESULTS = ["connected", "denied", "failed", "forbidden", "client_changed"] as const;

export function SearchConsoleView() {
  const t = useTranslations("searchConsole");
  const tp = useTranslations("pages.searchConsole");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canEdit = useCan("member");
  const queryClient = useQueryClient();
  const [days, setDays] = useState<Range>("28");
  const [managing, setManaging] = useState(false);
  const openManager = useCallback(() => setManaging(true), []);

  const performance = useQuery({
    queryKey: ["performance", project?.id, days],
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/projects/${project?.id}/performance?days=${days}`,
        PerformanceDataSchema,
        { signal },
      ),
    enabled: project !== null,
    // Poll while the first import of a source is running.
    refetchInterval: (query) => (importing(query.state.data) ? 10_000 : false),
  });
  const sync = useMutation({
    mutationFn: () =>
      apiSend("POST", `/workspaces/${workspace.id}/projects/${project?.id}/integrations/sync`),
    onSuccess: () => {
      toast.success(t("syncQueued"));
      void queryClient.invalidateQueries({ queryKey: ["performance", project?.id] });
    },
    onError: (error) => toast.error(errorMessage(error, t("syncFailed"))),
  });

  if (!project) return null;
  const data = performance.data;
  const provenance = (source: string, integration: ProjectIntegration) => ({
    source,
    updatedAt: integration.syncedThrough
      ? formatDate(integration.syncedThrough, locale)
      : undefined,
    labels: {
      source: t("provenance.source"),
      method: t("provenance.method"),
      updated: t("provenance.dataThrough"),
    },
  });
  const integrations = data?.integrations ?? null;
  const hasSource = Boolean(integrations?.gsc || integrations?.ga4);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <Suspense fallback={null}>
        <OAuthResultNotice onConnected={openManager} />
      </Suspense>
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={
          hasSource && (
            <>
              <ToggleGroup
                variant="outline"
                size="sm"
                value={[days]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next) setDays(next as Range);
                }}
                aria-label={t("rangeLabel")}
              >
                {RANGES.map((range) => (
                  <ToggleGroupItem key={range} value={range} className="tabular-nums">
                    {t(`range.${range}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {canEdit && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sync.isPending}
                    onClick={() => sync.mutate()}
                  >
                    <RefreshCw />
                    {t("syncNow")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setManaging(true)}>
                    <Settings2 />
                    {t("manage")}
                  </Button>
                </>
              )}
            </>
          )
        }
      />

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
          <Skeleton className="h-72 sm:col-span-2 xl:col-span-4" />
        </div>
      ) : !hasSource ? (
        data.googleConfigured ? (
          <ConnectSetup project={project} onChoose={() => setManaging(true)} />
        ) : (
          <NotConfigured />
        )
      ) : (
        <>
          <SourceStatus data={data} project={project} locale={locale} />
          {integrations?.gsc &&
            (data.searchConsole ? (
              <SearchPerformance
                data={data.searchConsole}
                locale={locale}
                provenance={provenance("Google Search Console", integrations.gsc)}
              />
            ) : (
              <ImportPending integration={integrations.gsc} />
            ))}
          {integrations?.ga4 &&
            (data.analytics ? (
              <AnalyticsPerformance
                data={data.analytics}
                locale={locale}
                provenance={provenance("Google Analytics 4", integrations.ga4)}
              />
            ) : (
              <ImportPending integration={integrations.ga4} />
            ))}
          {!integrations?.ga4 && canEdit && (
            <Alert>
              <BarChart3 aria-hidden />
              <AlertTitle>{t("addGa4.title")}</AlertTitle>
              <AlertDescription>{t("addGa4.body")}</AlertDescription>
              <AlertAction>
                <Button size="sm" variant="outline" onClick={() => setManaging(true)}>
                  {t("addGa4.action")}
                </Button>
              </AlertAction>
            </Alert>
          )}
        </>
      )}

      <SourcesDialog
        project={project}
        integrations={integrations}
        open={managing}
        onOpenChange={setManaging}
      />
    </div>
  );
}

function importing(data: PerformanceData | undefined): boolean {
  if (!data) return false;
  const { gsc, ga4 } = data.integrations;
  return [gsc, ga4].some(
    (integration) =>
      integration && integration.syncedThrough === null && integration.lastError === null,
  );
}

/** Toasts the result of the Google consent flow (`?google=…`) and clears it from the URL. */
function OAuthResultNotice({ onConnected }: { onConnected: () => void }) {
  const t = useTranslations("searchConsole.oauth");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const result = params.get("google");
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!result || handled.current === result) return;
    handled.current = result;
    if (result === "connected") {
      toast.success(t("connected"));
      onConnected();
    } else {
      const known = (OAUTH_RESULTS as readonly string[]).includes(result);
      toast.error(t(known ? (result as (typeof OAUTH_RESULTS)[number]) : "failed"));
    }
    router.replace(pathname, { scroll: false });
  }, [result, t, onConnected, router, pathname]);

  return null;
}

function SourceStatus({
  data,
  project,
  locale,
}: {
  data: PerformanceData;
  project: Project;
  locale: Locale;
}) {
  const t = useTranslations("searchConsole.status");
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const sources = [
    { type: "gsc" as const, integration: data.integrations.gsc },
    { type: "ga4" as const, integration: data.integrations.ga4 },
  ].filter(
    (entry): entry is { type: "gsc" | "ga4"; integration: ProjectIntegration } =>
      entry.integration !== null,
  );
  const revoked = sources.some((entry) => entry.integration.connectionStatus === "REVOKED");

  return (
    <div className="flex flex-col gap-3">
      {revoked && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden />
          <AlertTitle>{t("revokedTitle")}</AlertTitle>
          <AlertDescription>{isAdmin ? t("revokedBody") : t("revokedAskAdmin")}</AlertDescription>
          {isAdmin && (
            <AlertAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  connectGoogle(workspace.id, project.id).catch((error: unknown) =>
                    toast.error(errorMessage(error, t("reconnectFailed"))),
                  )
                }
              >
                {t("reconnect")}
              </Button>
            </AlertAction>
          )}
        </Alert>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {sources.map(({ type, integration }) => {
          const failing =
            integration.lastError !== null || integration.connectionStatus === "REVOKED";
          return (
            <li
              key={type}
              className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3 text-sm"
            >
              {failing ? (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
              ) : (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {t(`type.${type}`)}
                  <span className="sr-only">: {failing ? t("failing") : t("healthy")}</span>
                </p>
                <p className="truncate text-muted-foreground" title={integration.externalId}>
                  {type === "gsc"
                    ? siteLabel(integration.externalId, (domain) => t("domainProperty", { domain }))
                    : (integration.displayName ?? integration.externalId)}{" "}
                  · {integration.email}
                </p>
                <p className="text-xs text-muted-foreground">
                  {integration.lastSyncedAt
                    ? t("lastSync", {
                        time: formatRelativeTime(new Date(integration.lastSyncedAt), locale),
                        date: integration.syncedThrough
                          ? formatDate(integration.syncedThrough, locale)
                          : "—",
                      })
                    : t("neverSynced")}
                </p>
                {integration.lastError && integration.connectionStatus !== "REVOKED" && (
                  <p className="mt-1 text-xs text-critical">
                    {t("error", { error: integration.lastError })}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ImportPending({ integration }: { integration: ProjectIntegration }) {
  const t = useTranslations("searchConsole.pending");
  const failed = integration.lastError !== null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {failed ? (
            <CircleAlert className="size-4 text-critical" aria-hidden />
          ) : (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          {t(failed ? "failedTitle" : "title", { source: t(`source.${integration.type}`) })}
        </CardTitle>
        <CardDescription>{failed ? t("failedBody") : t("body")}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** First visit: connect a Google account, then pick the properties. */
function ConnectSetup({ project, onChoose }: { project: Project; onChoose: () => void }) {
  const t = useTranslations("searchConsole.setup");
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const canEdit = useCan("member");
  const [pending, setPending] = useState(false);
  const status = useQuery({
    queryKey: googleStatusKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/integrations/google`, GoogleIntegrationsSchema, {
        signal,
      }),
  });
  const connected =
    status.data?.connections.some((connection) => connection.status === "ACTIVE") ?? false;

  async function connect() {
    setPending(true);
    try {
      await connectGoogle(workspace.id, project.id);
    } catch (error) {
      toast.error(errorMessage(error, t("connectFailed")));
      setPending(false);
    }
  }

  return (
    <EmptyState icon={Search} title={t("title")} description={t("body")}>
      <div className="flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-2">
          {connected && canEdit && <Button onClick={onChoose}>{t("choose")}</Button>}
          {isAdmin && (
            <Button
              variant={connected ? "outline" : "default"}
              onClick={connect}
              disabled={pending}
            >
              <KeyRound />
              {connected ? t("connectAnother") : t("connect")}
            </Button>
          )}
        </div>
        {!connected && !isAdmin && <p className="text-sm text-muted-foreground">{t("askAdmin")}</p>}
        <p className="flex max-w-md items-start gap-1.5 text-left text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("privacy")}
        </p>
      </div>
    </EmptyState>
  );
}

/** Workspaces without a Google OAuth client: why one is needed and where to add it. */
function NotConfigured() {
  const t = useTranslations("searchConsole.notConfigured");
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  return (
    <EmptyState icon={KeyRound} title={t("title")} description={t("body")}>
      {isAdmin ? (
        <Button
          nativeButton={false}
          render={
            <Link href={`/${workspace.slug}/settings/providers#${GOOGLE_CLIENT_SECTION_ID}`} />
          }
        >
          {t("setUp")}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{t("askAdmin")}</p>
      )}
    </EmptyState>
  );
}
