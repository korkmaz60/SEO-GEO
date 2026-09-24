"use client";

import { ProviderCredentialSchema, type Locale, type ProviderCredential } from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, CircleHelp, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataForSeoForm } from "@/components/credentials/dataforseo-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { GoogleConnections } from "./google-connections";
import { SettingsSection } from "./settings-section";

const STATUS_ICON = {
  VALID: CircleCheck,
  INVALID: CircleAlert,
  UNVERIFIED: CircleHelp,
} as const;

const UPCOMING = [{ key: "aiPlatforms", milestone: "M3" }] as const;

export function credentialsQueryKey(workspaceId: string) {
  return ["credentials", workspaceId] as const;
}

export function ProvidersSettings() {
  const t = useTranslations("providers");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const [replacing, setReplacing] = useState(false);
  const queryKey = credentialsQueryKey(workspace.id);
  const credentials = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/credentials`,
        z.object({ data: z.array(ProviderCredentialSchema) }),
        { signal },
      ),
  });
  const dataForSeo = credentials.data?.data.find(
    (credential) => credential.provider === "DATAFORSEO",
  );

  const saved = (credential: ProviderCredential) => {
    queryClient.setQueryData(queryKey, { data: [credential] });
    setReplacing(false);
    toast.success(t("dataforseo.saved"));
    router.refresh();
  };
  const verify = useMutation({
    mutationFn: (credential: ProviderCredential) =>
      apiSend(
        "POST",
        `/workspaces/${workspace.id}/credentials/${credential.id}/verify`,
        undefined,
        ProviderCredentialSchema,
      ),
    onSuccess: (credential) => {
      queryClient.setQueryData(queryKey, { data: [credential] });
      if (credential.status === "VALID") toast.success(t("dataforseo.verified"));
      else toast.error(t("dataforseo.rejected"));
    },
    onError: (error) => toast.error(errorMessage(error, te("generic"))),
  });

  async function disconnect(credential: ProviderCredential) {
    await apiSend("DELETE", `/workspaces/${workspace.id}/credentials/${credential.id}`);
    queryClient.setQueryData(queryKey, { data: [] });
    toast.success(t("dataforseo.removed"));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title="DataForSEO"
        description={t("dataforseo.description")}
        action={
          dataForSeo && (
            <Badge
              variant="outline"
              className={cn(
                dataForSeo.status === "VALID" && "text-success",
                dataForSeo.status === "INVALID" && "text-critical",
              )}
            >
              {(() => {
                const Icon = STATUS_ICON[dataForSeo.status];
                return <Icon aria-hidden />;
              })()}
              {t(`status.${dataForSeo.status}`)}
            </Badge>
          )
        }
        footer={
          isAdmin &&
          dataForSeo &&
          !replacing && (
            <>
              <ConfirmDialog
                trigger={<Button variant="ghost">{t("dataforseo.disconnect")}</Button>}
                title={t("dataforseo.disconnectTitle")}
                description={t("dataforseo.disconnectBody")}
                confirmLabel={t("dataforseo.disconnect")}
                onConfirm={() => disconnect(dataForSeo)}
              />
              <Button variant="outline" onClick={() => setReplacing(true)}>
                {t("dataforseo.replace")}
              </Button>
              <Button
                variant="outline"
                disabled={verify.isPending}
                onClick={() => verify.mutate(dataForSeo)}
              >
                <RefreshCw
                  data-icon="inline-start"
                  className={cn(verify.isPending && "animate-spin")}
                />
                {t("dataforseo.verify")}
              </Button>
            </>
          )
        }
      >
        {credentials.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : credentials.isError ? (
          <FormAlert message={te("generic")} />
        ) : dataForSeo && !replacing ? (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{t("dataforseo.login")}</dt>
              <dd className="truncate font-medium">{dataForSeo.details.login ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{t("dataforseo.balanceLabel")}</dt>
              <dd className="font-medium tabular-nums">
                {dataForSeo.details.balanceUsd !== undefined
                  ? formatUsd(dataForSeo.details.balanceUsd, locale)
                  : "—"}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs text-muted-foreground">{t("dataforseo.lastVerified")}</dt>
              <dd className="font-medium">
                {dataForSeo.lastVerifiedAt
                  ? formatRelativeTime(new Date(dataForSeo.lastVerifiedAt), locale)
                  : "—"}
              </dd>
            </div>
            {dataForSeo.lastError && (
              <div className="sm:col-span-3">
                <FormAlert
                  message={
                    dataForSeo.status === "INVALID"
                      ? t("dataforseo.invalidHint")
                      : t("dataforseo.unreachableHint")
                  }
                />
              </div>
            )}
          </dl>
        ) : isAdmin ? (
          <DataForSeoForm
            workspaceId={workspace.id}
            defaultLogin={dataForSeo?.details.login}
            onSaved={saved}
            autoFocus={replacing}
            actions={
              replacing && (
                <Button type="button" variant="ghost" onClick={() => setReplacing(false)}>
                  {t("cancel")}
                </Button>
              )
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("dataforseo.askAdmin")}</p>
        )}
      </SettingsSection>

      <GoogleConnections />

      <SettingsSection title={t("upcomingTitle")} description={t("upcomingDescription")}>
        <ul className="flex flex-col divide-y">
          {UPCOMING.map((item) => (
            <li key={item.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{t(`upcoming.${item.key}.title`)}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`upcoming.${item.key}.description`)}
                </span>
              </div>
              <Badge variant="outline">{item.milestone}</Badge>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </div>
  );
}
