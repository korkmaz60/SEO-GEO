"use client";

import {
  GoogleIntegrationsSchema,
  GooglePropertiesSchema,
  ProjectIntegrationsSchema,
  type Project,
  type ProjectIntegrations,
} from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { useCan, useWorkspace } from "@/lib/workspace-context";

const NONE = "none";
const AuthorizeResponseSchema = z.object({ url: z.url() });

export function googleStatusKey(workspaceId: string) {
  return ["google", workspaceId] as const;
}

/** Starts the Google consent flow; the browser returns to the project's Search Console page. */
export async function connectGoogle(workspaceId: string, projectId: string): Promise<void> {
  const { url } = await apiSend(
    "POST",
    `/workspaces/${workspaceId}/integrations/google/authorize`,
    { projectId },
    AuthorizeResponseSchema,
  );
  window.location.assign(url);
}

/** `sc-domain:example.com` → `example.com (domain property)`; URL-prefix properties stay as they are. */
export function siteLabel(siteUrl: string, domainLabel: (domain: string) => string): string {
  return siteUrl.startsWith("sc-domain:")
    ? domainLabel(siteUrl.slice("sc-domain:".length))
    : siteUrl;
}

/** Chooses the Search Console site and GA4 property of a project from a connected Google account. */
export function SourcesDialog({
  project,
  integrations,
  open,
  onOpenChange,
}: {
  project: Project;
  integrations: ProjectIntegrations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("searchConsole.sources");
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: googleStatusKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/integrations/google`, GoogleIntegrationsSchema, {
        signal,
      }),
    enabled: open,
  });
  const active =
    status.data?.connections.filter((connection) => connection.status === "ACTIVE") ?? [];
  const current = integrations?.gsc?.connectionId ?? integrations?.ga4?.connectionId;
  const [picked, setPicked] = useState<string | null>(null);
  const connectionId =
    picked ?? active.find((connection) => connection.id === current)?.id ?? active[0]?.id ?? null;
  const properties = useQuery({
    queryKey: [...googleStatusKey(workspace.id), connectionId, "properties", project.id],
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/integrations/google/${connectionId}/properties?projectId=${project.id}`,
        GooglePropertiesSchema,
        { signal },
      ),
    enabled: open && connectionId !== null,
  });
  const [site, setSite] = useState<string | null>(null);
  const [property, setProperty] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sites = properties.data?.sites ?? [];
  const ga4 = properties.data?.ga4 ?? [];
  const sameAccount = (type: "gsc" | "ga4") => integrations?.[type]?.connectionId === connectionId;
  const chosenSite =
    site ??
    (sameAccount("gsc") ? integrations?.gsc?.externalId : undefined) ??
    sites.find((entry) => entry.matchesProject)?.siteUrl ??
    NONE;
  const chosenProperty =
    property ?? (sameAccount("ga4") ? integrations?.ga4?.externalId : undefined) ?? NONE;

  const siteItems = [
    { value: NONE, label: t("noSite") },
    ...sites.map((entry) => ({
      value: entry.siteUrl,
      label: `${siteLabel(entry.siteUrl, (domain) => t("domainProperty", { domain }))}${entry.matchesProject ? ` · ${t("suggested")}` : ""}`,
    })),
  ];
  const propertyItems = [
    { value: NONE, label: t("noProperty") },
    ...ga4.map((entry) => ({
      value: entry.property,
      label: `${entry.displayName} · ${entry.accountName}`,
    })),
  ];
  const accountItems = active.map((connection) => ({
    value: connection.id,
    label: connection.email,
  }));

  function close(next: boolean) {
    if (!next) {
      setPicked(null);
      setSite(null);
      setProperty(null);
    }
    onOpenChange(next);
  }

  async function save() {
    if (!connectionId) return;
    setPending(true);
    const base = `/workspaces/${workspace.id}/projects/${project.id}/integrations`;
    try {
      if (
        chosenSite !== NONE &&
        (chosenSite !== integrations?.gsc?.externalId || !sameAccount("gsc"))
      ) {
        await apiSend(
          "PUT",
          `${base}/gsc`,
          { connectionId, siteUrl: chosenSite },
          ProjectIntegrationsSchema,
        );
      }
      if (
        chosenProperty !== NONE &&
        (chosenProperty !== integrations?.ga4?.externalId || !sameAccount("ga4"))
      ) {
        await apiSend(
          "PUT",
          `${base}/ga4`,
          { connectionId, property: chosenProperty },
          ProjectIntegrationsSchema,
        );
      }
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["performance", project.id] });
      close(false);
    } catch (error) {
      toast.error(errorMessage(error, t("saveFailed")));
    } finally {
      setPending(false);
    }
  }

  async function connect() {
    try {
      await connectGoogle(workspace.id, project.id);
    } catch (error) {
      toast.error(errorMessage(error, t("connectFailed")));
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { domain: project.domain })}</DialogDescription>
        </DialogHeader>
        {!status.data ? (
          <Skeleton className="h-40" />
        ) : active.length === 0 ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{isAdmin ? t("noAccount") : t("askAdmin")}</p>
            {isAdmin && <Button onClick={connect}>{t("connect")}</Button>}
          </div>
        ) : (
          <FieldGroup>
            <Field>
              <FieldLabel>{t("account")}</FieldLabel>
              <Select
                items={accountItems}
                value={connectionId}
                onValueChange={(value) => {
                  if (!value) return;
                  setPicked(value);
                  setSite(null);
                  setProperty(null);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto justify-start p-0"
                  onClick={connect}
                >
                  {t("connectAnother")}
                </Button>
              )}
            </Field>
            {properties.isError ? (
              <p className="text-sm text-destructive">
                {errorMessage(properties.error, t("loadFailed"))}
              </p>
            ) : !properties.data ? (
              <Skeleton className="h-28" />
            ) : (
              <>
                <Field>
                  <FieldLabel>{t("site")}</FieldLabel>
                  <Select
                    items={siteItems}
                    value={chosenSite}
                    onValueChange={(value) => value && setSite(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {siteItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {sites.length === 0 ? t("noSites") : t("siteHint")}
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel>{t("property")}</FieldLabel>
                  <Select
                    items={propertyItems}
                    value={chosenProperty}
                    onValueChange={(value) => value && setProperty(value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {propertyItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldDescription>
                    {ga4.length === 0 ? t("noProperties") : t("propertyHint")}
                  </FieldDescription>
                </Field>
              </>
            )}
          </FieldGroup>
        )}
        {active.length > 0 && (
          <DialogFooter>
            <p className="mr-auto self-center text-xs text-muted-foreground">{t("readOnly")}</p>
            <Button
              onClick={save}
              disabled={
                pending || !properties.data || (chosenSite === NONE && chosenProperty === NONE)
              }
            >
              {t("save")}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
