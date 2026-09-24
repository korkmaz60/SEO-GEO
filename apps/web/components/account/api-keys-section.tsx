"use client";

import type { Locale } from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingsSection } from "@/components/settings/settings-section";
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
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { formatDate, formatRelativeTime } from "@/lib/format";

const DAY = 24 * 60 * 60;
const EXPIRY_DAYS = { days30: 30, days90: 90, days365: 365, never: null } as const;
type Expiry = keyof typeof EXPIRY_DAYS;
const EXPIRY_OPTIONS = Object.keys(EXPIRY_DAYS) as Expiry[];

const queryKey = ["api-keys"];

/** Personal API keys (`sg_…`) for scripts and integrations; they act as the user. */
export function ApiKeysSection() {
  const t = useTranslations("account.apiKeys");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const keys = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await authClient.apiKey.list({
        query: { sortBy: "createdAt", sortDirection: "desc" },
      });
      if (error || !data) throw error ?? new Error("Empty response");
      return data.apiKeys;
    },
  });

  async function remove(keyId: string) {
    const { error } = await authClient.apiKey.delete({ keyId });
    if (error) throw new Error(te(authErrorKey(error)));
    await queryClient.invalidateQueries({ queryKey });
    toast.success(t("deleted"));
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      action={<CreateKeyDialog onCreated={() => queryClient.invalidateQueries({ queryKey })} />}
    >
      {keys.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : keys.isError ? (
        <FormAlert message={te("generic")} />
      ) : keys.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {keys.data.map((key) => (
            <li key={key.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{key.name ?? t("unnamed")}</span>
                <span className="truncate text-xs text-muted-foreground">
                  <code className="font-mono">{key.start ?? key.prefix ?? "sg_"}…</code>
                  {" · "}
                  {t("created", { date: formatDate(key.createdAt, locale) })}
                  {" · "}
                  {key.expiresAt
                    ? t("expires", { date: formatDate(key.expiresAt, locale) })
                    : t("neverExpires")}
                  {key.lastRequest &&
                    ` · ${t("lastUsed", { when: formatRelativeTime(new Date(key.lastRequest), locale) })}`}
                </span>
              </div>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                    <Trash2 />
                  </Button>
                }
                title={t("deleteTitle", { name: key.name ?? t("unnamed") })}
                description={t("deleteBody")}
                confirmLabel={t("delete")}
                onConfirm={() => remove(key.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function CreateKeyDialog({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("account.apiKeys");
  const te = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState<Expiry>("days90");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const items = EXPIRY_OPTIONS.map((value) => ({ value, label: t(`expiry.${value}`) }));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name")).trim();
    const days = EXPIRY_DAYS[expiry];
    setPending(true);
    setError(null);
    const { data, error } = await authClient.apiKey.create({
      name,
      expiresIn: days === null ? null : days * DAY,
    });
    setPending(false);
    if (error || !data) {
      setError(te(authErrorKey(error)));
      return;
    }
    setCreated(data.key);
    onCreated();
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
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all select-all">
                {created}
              </code>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("copy")}
                onClick={async () => {
                  await navigator.clipboard.writeText(created);
                  toast.success(t("copied"));
                }}
              >
                <Copy />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>{t("done")}</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{t("createTitle")}</DialogTitle>
              <DialogDescription>{t("createBody")}</DialogDescription>
            </DialogHeader>
            <FormAlert message={error} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="api-key-name">{t("name")}</FieldLabel>
                <Input
                  id="api-key-name"
                  name="name"
                  maxLength={64}
                  placeholder={t("namePlaceholder")}
                  required
                />
              </Field>
              <Field>
                <FieldLabel>{t("expiryLabel")}</FieldLabel>
                <Select
                  items={items}
                  value={expiry}
                  onValueChange={(value) => value && setExpiry(value as Expiry)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t("expiryHint")}</FieldDescription>
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
