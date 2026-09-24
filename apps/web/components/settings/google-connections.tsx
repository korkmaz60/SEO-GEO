"use client";

import { GoogleIntegrationsSchema, type Locale } from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { googleStatusKey } from "@/components/search-console/sources-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { SettingsSection } from "./settings-section";

/** Google accounts connected to the workspace; properties are chosen per project. */
export function GoogleConnections() {
  const t = useTranslations("providers.google");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const isAdmin = useCan("admin");
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: googleStatusKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/integrations/google`, GoogleIntegrationsSchema, {
        signal,
      }),
  });
  const connections = status.data?.connections ?? [];

  async function disconnect(connectionId: string) {
    await apiSend("DELETE", `/workspaces/${workspace.id}/integrations/google/${connectionId}`);
    toast.success(t("removed"));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: googleStatusKey(workspace.id) }),
      queryClient.invalidateQueries({ queryKey: ["performance"] }),
    ]);
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      footer={
        project &&
        status.data?.configured && (
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href={`/${workspace.slug}/${project.slug}/search-console`} />}
          >
            {t("openSearchConsole")}
          </Button>
        )
      }
    >
      {status.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : status.isError ? (
        <FormAlert message={te("generic")} />
      ) : connections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status.data.configured ? t("empty") : t("notConfigured")}
        </p>
      ) : (
        <ul className="flex flex-col divide-y">
          {connections.map((connection) => {
            const revoked = connection.status === "REVOKED";
            return (
              <li
                key={connection.id}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{connection.email}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("connectedAt", {
                      time: formatRelativeTime(new Date(connection.createdAt), locale),
                    })}
                  </span>
                </div>
                <Badge variant="outline" className={cn(revoked ? "text-critical" : "text-success")}>
                  {revoked ? <CircleAlert aria-hidden /> : <CircleCheck aria-hidden />}
                  {t(revoked ? "revoked" : "active")}
                </Badge>
                {isAdmin && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="sm">
                        {t("disconnect")}
                      </Button>
                    }
                    title={t("disconnectTitle", { email: connection.email })}
                    description={t("disconnectBody")}
                    confirmLabel={t("disconnect")}
                    onConfirm={() => disconnect(connection.id)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
