"use client";

import { ProviderCredentialSchema, type ProviderCredential } from "@seo-geo/contracts";
import { ExternalLink, LockKeyhole } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactNode } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, apiSend } from "@/lib/api";

export const DATAFORSEO_API_ACCESS_URL = "https://app.dataforseo.com/api-access";

/** Connects (or replaces) the workspace's DataForSEO account; the api verifies it first. */
export function DataForSeoForm({
  workspaceId,
  defaultLogin,
  onSaved,
  actions,
  autoFocus = false,
}: {
  workspaceId: string;
  defaultLogin?: string;
  autoFocus?: boolean;
  onSaved: (credential: ProviderCredential) => void;
  /** Extra buttons next to submit, e.g. "Skip" or "Cancel". */
  actions?: ReactNode;
}) {
  const t = useTranslations("providers.dataforseo");
  const te = useTranslations("errors");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const credential = await apiSend(
        "PUT",
        `/workspaces/${workspaceId}/credentials/dataforseo`,
        { login: String(form.get("login")).trim(), password: String(form.get("password")) },
        ProviderCredentialSchema,
      );
      onSaved(credential);
    } catch (caught) {
      setPending(false);
      if (caught instanceof ApiError && caught.status === 422) setError(t("rejected"));
      else if (caught instanceof ApiError && caught.status === 502) setError(t("unreachable"));
      else if (caught instanceof ApiError && caught.status === 403) setError(t("forbidden"));
      else setError(te("generic"));
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormAlert message={error} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="dataforseo-login">{t("login")}</FieldLabel>
          <Input
            id="dataforseo-login"
            name="login"
            type="email"
            autoComplete="off"
            defaultValue={defaultLogin}
            required
            autoFocus={autoFocus && !defaultLogin}
          />
          <FieldDescription>{t("loginHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="dataforseo-password">{t("password")}</FieldLabel>
          <Input
            id="dataforseo-password"
            name="password"
            type="password"
            autoComplete="off"
            required
            autoFocus={autoFocus && Boolean(defaultLogin)}
          />
          <FieldDescription>
            {t("passwordHint")}{" "}
            <a
              href={DATAFORSEO_API_ACCESS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-link underline-offset-4 hover:underline"
            >
              {t("openDashboard")}
              <ExternalLink className="size-3" aria-hidden />
            </a>
          </FieldDescription>
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
