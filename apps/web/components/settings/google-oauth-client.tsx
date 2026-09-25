"use client";

import {
  GOOGLE_CLIENT_ID_PATTERN,
  GoogleIntegrationsSchema,
  type GoogleIntegrations,
  type Locale,
} from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, LockKeyhole } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyField } from "@/components/data/copy-field";
import { googleStatusKey } from "@/components/search-console/sources-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { SettingsSection } from "./settings-section";

/** Where each setup step happens in Google Cloud. */
const GOOGLE_CLOUD = {
  searchConsoleApi: "https://console.cloud.google.com/apis/library/searchconsole.googleapis.com",
  analyticsDataApi: "https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com",
  analyticsAdminApi: "https://console.cloud.google.com/apis/library/analyticsadmin.googleapis.com",
  audience: "https://console.cloud.google.com/auth/audience",
  clients: "https://console.cloud.google.com/auth/clients",
};

/** The anchor the Search Console page links to. */
export const GOOGLE_CLIENT_SECTION_ID = "google-client";

function CloudLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-0.5 font-medium text-link underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

/**
 * The Google OAuth client the workspace connects accounts with: its own (entered here, checked
 * with Google, stored encrypted) or the installation's, and how to create one.
 */
export function GoogleOAuthClientSettings() {
  const t = useTranslations("providers.googleClient");
  const tp = useTranslations("providers");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const status = useQuery({
    queryKey: googleStatusKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/integrations/google`, GoogleIntegrationsSchema, {
        signal,
      }),
  });
  const client = status.data?.client ?? null;
  const own = client?.source === "WORKSPACE";
  const showForm = isAdmin && (editing || client === null);

  async function refresh(next?: GoogleIntegrations) {
    if (next) queryClient.setQueryData(googleStatusKey(workspace.id), next);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: googleStatusKey(workspace.id) }),
      queryClient.invalidateQueries({ queryKey: ["performance"] }),
    ]);
  }

  async function remove() {
    await apiSend("DELETE", `/workspaces/${workspace.id}/integrations/google/client`);
    toast.success(t("removed"));
    setEditing(false);
    await refresh();
  }

  return (
    <SettingsSection
      id={GOOGLE_CLIENT_SECTION_ID}
      title={t("title")}
      description={t("description")}
      action={
        client && <Badge variant="outline">{t(own ? "sourceWorkspace" : "sourceInstance")}</Badge>
      }
      footer={
        isAdmin &&
        client &&
        !editing && (
          <>
            {own && (
              <ConfirmDialog
                trigger={<Button variant="ghost">{t("remove")}</Button>}
                title={t("removeTitle")}
                description={t("removeBody", {
                  instance: String(status.data?.instanceClient ?? false),
                })}
                confirmLabel={t("remove")}
                destructive
                onConfirm={remove}
              />
            )}
            <Button variant="outline" onClick={() => setEditing(true)}>
              {own ? t("replace") : t("useOwn")}
            </Button>
          </>
        )
      }
    >
      {status.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : status.isError ? (
        <FormAlert message={te("generic")} />
      ) : (
        <div className="flex flex-col gap-5">
          {client && (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs text-muted-foreground">{t("clientId")}</dt>
                <dd className="truncate font-mono text-sm" title={client.clientId}>
                  {client.clientId}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-xs text-muted-foreground">
                  {own ? t("verifiedAt") : t("configuredBy")}
                </dt>
                <dd className="text-sm font-medium">
                  {own && client.verifiedAt
                    ? formatRelativeTime(new Date(client.verifiedAt), locale)
                    : t("serverSetting")}
                </dd>
              </div>
            </dl>
          )}
          {!client && !isAdmin && <p className="text-sm text-muted-foreground">{t("askAdmin")}</p>}
          {showForm && status.data && (
            <>
              <SetupGuide redirectUri={status.data.redirectUri} />
              {own && <p className="text-sm text-muted-foreground">{t("replaceHint")}</p>}
              <ClientForm
                workspaceId={workspace.id}
                onSaved={async (next) => {
                  toast.success(t("saved"));
                  setEditing(false);
                  await refresh(next);
                }}
                actions={
                  editing && (
                    <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                      {tp("cancel")}
                    </Button>
                  )
                }
              />
            </>
          )}
        </div>
      )}
    </SettingsSection>
  );
}

/** The one-time Google Cloud setup, with direct links to each page. */
function SetupGuide({ redirectUri }: { redirectUri: string }) {
  const t = useTranslations("providers.googleClient.guide");
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 text-sm">
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t("title")}</p>
        <p className="text-muted-foreground">{t("why")}</p>
      </div>
      <ol className="flex list-decimal flex-col gap-2.5 pl-5">
        <li>
          {t.rich("step1", {
            sc: (chunks) => <CloudLink href={GOOGLE_CLOUD.searchConsoleApi}>{chunks}</CloudLink>,
            data: (chunks) => <CloudLink href={GOOGLE_CLOUD.analyticsDataApi}>{chunks}</CloudLink>,
            admin: (chunks) => (
              <CloudLink href={GOOGLE_CLOUD.analyticsAdminApi}>{chunks}</CloudLink>
            ),
          })}
        </li>
        <li>
          {t.rich("step2", {
            audience: (chunks) => <CloudLink href={GOOGLE_CLOUD.audience}>{chunks}</CloudLink>,
          })}
        </li>
        <li>
          <div className="flex flex-col gap-1.5">
            <span>
              {t.rich("step3", {
                clients: (chunks) => <CloudLink href={GOOGLE_CLOUD.clients}>{chunks}</CloudLink>,
              })}
            </span>
            <CopyField value={redirectUri} />
          </div>
        </li>
        <li>{t("step4")}</li>
      </ol>
    </div>
  );
}

function ClientForm({
  workspaceId,
  onSaved,
  actions,
}: {
  workspaceId: string;
  onSaved: (status: GoogleIntegrations) => void;
  actions?: ReactNode;
}) {
  const t = useTranslations("providers.googleClient");
  const te = useTranslations("errors");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const clientId = String(form.get("clientId")).trim();
    const clientSecret = String(form.get("clientSecret")).trim();
    if (!GOOGLE_CLIENT_ID_PATTERN.test(clientId)) {
      setError(t("clientIdInvalid"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      onSaved(
        await apiSend(
          "PUT",
          `/workspaces/${workspaceId}/integrations/google/client`,
          { clientId, clientSecret },
          GoogleIntegrationsSchema,
        ),
      );
    } catch (caught) {
      const status = caught instanceof ApiError ? caught.status : 0;
      setError(
        status === 422
          ? t("rejected")
          : status === 502
            ? t("unreachable")
            : status === 403
              ? t("forbidden")
              : status === 400
                ? t("clientIdInvalid")
                : te("generic"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormAlert message={error} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="google-client-id">{t("clientId")}</FieldLabel>
          <Input
            id="google-client-id"
            name="clientId"
            autoComplete="off"
            spellCheck={false}
            placeholder={t("clientIdPlaceholder")}
            required
          />
          <FieldDescription>{t("clientIdHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="google-client-secret">{t("clientSecret")}</FieldLabel>
          <Input
            id="google-client-secret"
            name="clientSecret"
            type="password"
            autoComplete="off"
            required
          />
          <FieldDescription>{t("clientSecretHint")}</FieldDescription>
        </Field>
      </FieldGroup>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <LockKeyhole className="mt-px size-3.5 shrink-0" aria-hidden />
        {t("encrypted")}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("verifying") : t("submit")}
        </Button>
        {actions}
      </div>
    </form>
  );
}
