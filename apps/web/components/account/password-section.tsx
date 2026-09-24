"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";

export function PasswordSection() {
  const t = useTranslations("account.password");
  const ta = useTranslations("auth");
  const te = useTranslations("errors");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword"));
    if (newPassword !== String(form.get("confirmPassword"))) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setPending(true);
    setError(null);
    const { error } = await authClient.changePassword({
      currentPassword: String(form.get("currentPassword")),
      newPassword,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setError(te(authErrorKey(error)));
      return;
    }
    formElement.reset();
    toast.success(t("changed"));
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      onSubmit={save}
      footer={
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
            <FieldLabel htmlFor="current-password">{t("current")}</FieldLabel>
            <Input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="new-password">{t("new")}</FieldLabel>
            <Input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
            <FieldDescription>{ta("passwordHint")}</FieldDescription>
          </Field>
          <Field data-invalid={mismatch ? true : undefined}>
            <FieldLabel htmlFor="confirm-password">{t("confirm")}</FieldLabel>
            <Input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              aria-invalid={mismatch ? true : undefined}
            />
            <FieldError>{mismatch ? t("mismatch") : null}</FieldError>
          </Field>
        </FieldGroup>
      </div>
    </SettingsSection>
  );
}
