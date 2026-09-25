"use client";

import {
  DomainOverviewQuoteSchema,
  DomainOverviewSchema,
  type DomainOverviewRequest,
  type Locale,
} from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, KeyRound, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { usageQueryKey } from "@/components/app-shell/usage-meter";
import { EmptyState } from "@/components/data/empty-state";
import { RefreshDataButton } from "@/components/data/refresh-data";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiSend, errorMessage } from "@/lib/api";
import { analyzedHost } from "@/lib/domain";
import { formatUsd } from "@/lib/format";
import { MARKETS, findMarket } from "@/lib/locations";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { DomainReport } from "./domain-report";

const QUOTE_DELAY_MS = 400;

function requestKey(request: DomainOverviewRequest | null): string | null {
  return request ? `${request.domain}|${request.locationCode}` : null;
}

/** The earlier of two ISO timestamps. */
function oldest(a: string, b: string): string {
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/**
 * Domain overview (docs/frontend.md): the analyzed domain and market live in the URL
 * (`?domain=example.com&market=2792`), so an overview can be shared and competitors opened
 * with the back button working. Opening a domain that is not cached shows its cost first;
 * cached overviews are free and load right away.
 */
export function DomainOverviewView() {
  const t = useTranslations("domainOverview");
  const tp = useTranslations("pages.domainOverview");
  const locale = useLocale() as Locale;
  const { workspace, projects } = useWorkspace();
  const project = useCurrentProject();
  const canRun = useCan("member");
  const isAdmin = useCan("admin");
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fallbackMarket = findMarket(project?.locationCode ?? 0) ?? MARKETS[0];
  const urlInput = (searchParams.get("domain") ?? "").trim();
  const urlHost = analyzedHost(urlInput);
  const urlMarket = findMarket(Number(searchParams.get("market"))) ?? fallbackMarket;
  const active: DomainOverviewRequest | null =
    urlHost && urlMarket
      ? {
          domain: urlHost,
          locationCode: urlMarket.locationCode,
          languageCode: urlMarket.languageCode,
        }
      : null;

  // The form follows the URL: back and forward, shared links, competitor links.
  const urlState = `${urlHost ?? urlInput}|${urlMarket?.locationCode ?? ""}`;
  const [synced, setSynced] = useState(urlState);
  const [domain, setDomain] = useState(urlHost ?? urlInput);
  const [locationCode, setLocationCode] = useState(String(urlMarket?.locationCode ?? ""));
  if (synced !== urlState) {
    setSynced(urlState);
    setDomain(urlHost ?? urlInput);
    setLocationCode(String(urlMarket?.locationCode ?? ""));
  }
  // Requests the user asked for with the button; others run only when cached (free).
  const [confirmed, setConfirmed] = useState<ReadonlySet<string>>(() => new Set());
  const [formError, setFormError] = useState<string | null>(null);

  const market = findMarket(Number(locationCode)) ?? fallbackMarket;
  const formHost = analyzedHost(domain);
  const formRequest: DomainOverviewRequest | null =
    formHost && market
      ? { domain: formHost, locationCode: market.locationCode, languageCode: market.languageCode }
      : null;
  const debouncedKey = useDebouncedValue(JSON.stringify(formRequest), QUOTE_DELAY_MS);
  const debounced = JSON.parse(debouncedKey) as DomainOverviewRequest | null;

  const quoteOptions = (request: DomainOverviewRequest | null) => ({
    queryKey: ["domain-overview-quote", workspace.id, requestKey(request)] as const,
    queryFn: () =>
      apiSend(
        "POST",
        `/workspaces/${workspace.id}/research/domains/quote`,
        request,
        DomainOverviewQuoteSchema,
      ),
    enabled: canRun && request !== null,
    retry: false,
  });
  const formQuote = useQuery(quoteOptions(debounced));
  const activeQuote = useQuery(quoteOptions(active));
  // What loading the shown overview again costs (D23): every part, cached or not.
  const refreshQuote = useQuery({
    queryKey: ["domain-overview-quote", workspace.id, requestKey(active), "refresh"] as const,
    queryFn: () =>
      apiSend(
        "POST",
        `/workspaces/${workspace.id}/research/domains/quote`,
        { ...active, refresh: true },
        DomainOverviewQuoteSchema,
      ),
    enabled: canRun && active !== null,
    staleTime: Infinity,
    retry: false,
  });

  const activeKey = requestKey(active);
  const approved =
    activeQuote.data !== undefined &&
    (activeQuote.data.cached || (activeKey !== null && confirmed.has(activeKey)));
  const overview = useQuery({
    queryKey: ["domain-overview", workspace.id, activeKey] as const,
    queryFn: async () => {
      const result = await apiSend(
        "POST",
        `/workspaces/${workspace.id}/research/domains`,
        active,
        DomainOverviewSchema,
      );
      void queryClient.invalidateQueries({ queryKey: ["domain-overview-quote", workspace.id] });
      void queryClient.invalidateQueries({ queryKey: usageQueryKey(workspace.id) });
      return result;
    },
    enabled: canRun && approved,
    // The api caches overviews; results stay while the page is open.
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: () =>
      apiSend(
        "POST",
        `/workspaces/${workspace.id}/research/domains`,
        { ...active, refresh: true },
        DomainOverviewSchema,
      ),
    onSuccess: (result) => {
      // Keyed by the result, not by the URL: it may have changed while the request ran.
      queryClient.setQueryData(["domain-overview", workspace.id, requestKey(result)], result);
      void queryClient.invalidateQueries({ queryKey: ["domain-overview-quote", workspace.id] });
      void queryClient.invalidateQueries({ queryKey: usageQueryKey(workspace.id) });
      // Project backlink pages share the backlink summary.
      void queryClient.invalidateQueries({ queryKey: ["backlinks"] });
    },
  });

  function open(host: string, code: number, run: boolean) {
    const key = `${host}|${code}`;
    if (run) setConfirmed((previous) => new Set(previous).add(key));
    if (key === activeKey) {
      if (run && overview.isError) void overview.refetch();
      return;
    }
    const params = new URLSearchParams({ domain: host, market: String(code) });
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formHost || !market) {
      setFormError(t("invalidDomain"));
      return;
    }
    setFormError(null);
    open(formHost, market.locationCode, true);
  }

  const marketItems = MARKETS.map((entry) => ({
    value: String(entry.locationCode),
    label: `${entry.names[locale]} · ${entry.languageCode}`,
  }));
  const quoteText =
    formQuote.data && requestKey(debounced) === requestKey(formRequest)
      ? formQuote.data.cached
        ? t("quoteCached")
        : t("quote", { cost: formatUsd(formQuote.data.estimatedCostUsd, locale) })
      : null;
  // Say which host an address such as https://www.example.com/page stands for.
  const targetText =
    formHost && formHost !== domain.trim().toLowerCase() ? t("target", { domain: formHost }) : null;
  const hint = !canRun
    ? t("viewerNote")
    : formError
      ? formError
      : domain.trim() && !formHost
        ? t("invalidDomain")
        : formQuote.error
          ? errorMessage(formQuote.error, t("invalidDomain"))
          : [targetText, quoteText].filter(Boolean).join(" · ") || t("hint");
  const hintIsError =
    canRun && (Boolean(formError) || Boolean(domain.trim() && !formHost) || formQuote.isError);
  const missingProvider =
    overview.error instanceof ApiError &&
    overview.error.status === 409 &&
    overview.error.problem?.code === "provider_error";
  const activeMarketName = urlMarket
    ? `${urlMarket.names[locale]} · ${urlMarket.languageCode}`
    : "";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader title={tp("title")} description={tp("description")} />
      <Card>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
            <div className="grid gap-3 lg:grid-cols-[1fr_16rem_auto]">
              <Field>
                <FieldLabel htmlFor="domain" className="sr-only">
                  {t("domain")}
                </FieldLabel>
                <Input
                  id="domain"
                  value={domain}
                  onChange={(event) => {
                    setDomain(event.target.value);
                    setFormError(null);
                  }}
                  placeholder={t("domainPlaceholder")}
                  maxLength={2048}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={hintIsError || undefined}
                  aria-describedby="domain-hint"
                />
              </Field>
              <Select
                items={marketItems}
                value={locationCode}
                onValueChange={(value) => value && setLocationCode(value)}
              >
                <SelectTrigger className="w-full" aria-label={t("market")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {marketItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={!canRun || !domain.trim()}>
                <Search />
                {t("analyze")}
              </Button>
            </div>
            <p
              id="domain-hint"
              className={hintIsError ? "text-sm text-critical" : "text-sm text-muted-foreground"}
              aria-live="polite"
            >
              {hint}
            </p>
          </form>
        </CardContent>
      </Card>

      {!active ? (
        <EmptyState icon={Globe} title={t("emptyTitle")} description={t("emptyBody")}>
          {canRun && projects.length > 0 && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("yourProjects")}</span>
              <div className="flex flex-wrap justify-center gap-2">
                {projects.slice(0, 6).map((candidate) => (
                  <Button
                    key={candidate.id}
                    size="sm"
                    variant="outline"
                    onClick={() => open(candidate.domain, candidate.locationCode, false)}
                  >
                    {candidate.domain}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </EmptyState>
      ) : !canRun ? null : overview.data ? (
        <DomainReport
          overview={overview.data}
          onOpenDomain={(host) => open(host, overview.data.locationCode, false)}
          actions={
            <RefreshDataButton
              fetchedAt={oldest(
                overview.data.sources.labs.fetchedAt,
                overview.data.sources.backlinks.fetchedAt,
              )}
              costUsd={refreshQuote.data?.estimatedCostUsd}
              disabled={refresh.isPending}
              onRefresh={() => refresh.mutateAsync()}
            />
          }
        />
      ) : overview.error ? (
        missingProvider ? (
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
            <AlertDescription>{errorMessage(overview.error, t("failed"))}</AlertDescription>
            <AlertAction>
              <Button size="sm" variant="outline" onClick={() => void overview.refetch()}>
                {t("retry")}
              </Button>
            </AlertAction>
          </Alert>
        )
      ) : activeQuote.error ? (
        <Alert variant="destructive">
          <AlertTitle>{t("failed")}</AlertTitle>
          <AlertDescription>{errorMessage(activeQuote.error, t("invalidDomain"))}</AlertDescription>
        </Alert>
      ) : activeQuote.data && !approved ? (
        <Card>
          <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="font-medium">
                {t("confirm.title", { domain: activeQuote.data.domain })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("confirm.body", {
                  cost: formatUsd(activeQuote.data.estimatedCostUsd, locale),
                  market: activeMarketName,
                })}
              </p>
            </div>
            <Button
              className="shrink-0"
              onClick={() => active && open(active.domain, active.locationCode, true)}
            >
              <Search />
              {t("confirm.run", { cost: formatUsd(activeQuote.data.estimatedCostUsd, locale) })}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ReportSkeleton label={approved ? t("loading", { domain: active.domain }) : null} />
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
