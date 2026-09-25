"use client";

import {
  API_KEY_EXPIRY_DAYS,
  CreatedWorkspaceApiKeySchema,
  WorkspaceApiKeyListSchema,
  type ApiScope,
  type CreatedWorkspaceApiKey,
  type Locale,
} from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CopyField } from "@/components/data/copy-field";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { useCan, useWorkspace } from "@/lib/workspace-context";

/** Access levels offered for new keys; each includes the ones before it. */
const LEVELS: Record<"read" | "write" | "paid", ApiScope[]> = {
  read: ["read"],
  write: ["read", "write"],
  paid: ["read", "write", "run:paid"],
};
type Level = keyof typeof LEVELS;
type Expiry = `${(typeof API_KEY_EXPIRY_DAYS)[number]}` | "never";

/** Workspace API keys for scripts and MCP clients, and how to connect an MCP client. */
export function ApiKeysSettings() {
  const t = useTranslations("workspaceSettings.apiKeys");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const queryClient = useQueryClient();
  const base = `/workspaces/${workspace.id}/api-keys`;
  const queryKey = ["api-keys", workspace.id];
  const keys = useQuery({
    queryKey,
    queryFn: ({ signal }) => apiGet(base, WorkspaceApiKeyListSchema, { signal }),
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title={t("title")}
        description={t("description")}
        action={<CreateKeyDialog onCreated={() => queryClient.invalidateQueries({ queryKey })} />}
      >
        {keys.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : keys.isError ? (
          <FormAlert message={te("generic")} />
        ) : keys.data.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {keys.data.data.map((key) => (
              <li key={key.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-medium">{key.name}</span>
                    {key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="font-normal">
                        {t(`scopes.${scope === "run:paid" ? "paid" : scope}`)}
                      </Badge>
                    ))}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    <code className="font-mono">{key.start ?? "sg_"}…</code>
                    {!key.own && ` · ${key.createdBy.name || key.createdBy.email}`}
                    {" · "}
                    {t("created", { date: formatDate(key.createdAt, locale) })}
                    {" · "}
                    {key.expiresAt
                      ? t("expires", { date: formatDate(key.expiresAt, locale) })
                      : t("neverExpires")}
                    {key.lastUsedAt &&
                      ` · ${t("lastUsed", { when: formatRelativeTime(new Date(key.lastUsedAt), locale) })}`}
                  </span>
                </div>
                {(key.own || isAdmin) && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={t("revoke")}>
                        <Trash2 />
                      </Button>
                    }
                    title={t("revokeTitle", { name: key.name })}
                    description={t("revokeBody")}
                    confirmLabel={t("revoke")}
                    destructive
                    onConfirm={async () => {
                      try {
                        await apiSend("DELETE", `${base}/${key.id}`);
                        toast.success(t("revoked"));
                        await queryClient.invalidateQueries({ queryKey });
                      } catch (error) {
                        toast.error(errorMessage(error, te("generic")));
                      }
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
      <McpSetup />
    </div>
  );
}

function CreateKeyDialog({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("workspaceSettings.apiKeys");
  const { workspace } = useWorkspace();
  const canWrite = useCan("member");
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>("read");
  const [expiry, setExpiry] = useState<Expiry>("90");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedWorkspaceApiKey | null>(null);
  const levels = (canWrite ? (["read", "write", "paid"] as const) : (["read"] as const)).map(
    (value) => ({ value, label: t(`levels.${value}`) }),
  );
  const expiries = [...API_KEY_EXPIRY_DAYS.map(String), "never"].map((value) => ({
    value: value as Expiry,
    label: t(`expiry.${value as Expiry}`),
  }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    setPending(true);
    setError(null);
    try {
      const key = await apiSend(
        "POST",
        `/workspaces/${workspace.id}/api-keys`,
        {
          name,
          scopes: LEVELS[level],
          expiresInDays: expiry === "never" ? null : Number(expiry),
        },
        CreatedWorkspaceApiKeySchema,
      );
      setCreated(key);
      onCreated();
    } catch (caught) {
      setError(errorMessage(caught, t("failed")));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCreated(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus data-icon="inline-start" />
            {t("create")}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        {created ? (
          <div className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("createdTitle")}</DialogTitle>
              <DialogDescription>{t("createdBody")}</DialogDescription>
            </DialogHeader>
            <CopyField value={created.key} />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{t("done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("createTitle")}</DialogTitle>
              <DialogDescription>
                {t("createBody", { workspace: workspace.name })}
              </DialogDescription>
            </DialogHeader>
            <FormAlert message={error} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="workspace-key-name">{t("name")}</FieldLabel>
                <Input
                  id="workspace-key-name"
                  name="name"
                  maxLength={32}
                  placeholder={t("namePlaceholder")}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("level")}</FieldLabel>
                <Select
                  items={levels}
                  value={level}
                  onValueChange={(value) => value && setLevel(value as Level)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t(`levelHints.${level}`)}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("expiryLabel")}</FieldLabel>
                <Select
                  items={expiries}
                  value={expiry}
                  onValueChange={(value) => value && setExpiry(value as Expiry)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {expiries.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** How to connect an MCP client to this installation. */
function McpSetup() {
  const t = useTranslations("workspaceSettings.apiKeys.mcp");
  // The browser's origin is the address of this installation; the server renders a placeholder.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "https://…",
  );
  const url = `${origin}/api/v1/mcp`;
  const config = JSON.stringify(
    {
      mcpServers: {
        "seo-geo": { type: "http", url, headers: { Authorization: "Bearer sg_…" } },
      },
    },
    null,
    2,
  );
  return (
    <SettingsSection title={t("title")} description={t("description")}>
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">{t("endpoint")}</p>
          <CopyField value={url} />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">{t("claudeCode")}</p>
          <CopyField
            value={`claude mcp add --transport http seo-geo ${url} --header "Authorization: Bearer sg_…"`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="font-medium">{t("config")}</p>
          <CopyField value={config} multiline />
        </div>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>{t("tools")}</li>
          <li>{t("paid")}</li>
          <li>{t("scopes")}</li>
        </ul>
      </div>
    </SettingsSection>
  );
}
