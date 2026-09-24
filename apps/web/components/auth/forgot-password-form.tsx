"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

import { AuthCard } from "./auth-card";
import { FormAlert } from "./form-alert";

export function ForgotPasswordForm({ emailDelivery }: { emailDelivery: boolean }) {
  const t = useTranslations("auth");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    await authClient.requestPasswordReset({
      email: String(new FormData(event.currentTarget).get("email")).trim(),
      redirectTo: new URL("/reset-password", window.location.origin).toString(),
    });
    // The same answer whether or not the address has an account.
    setPending(false);
    setSent(true);
  }

  return (
    <AuthCard
      title={t("forgot.title")}
      description={emailDelivery ? t("forgot.description") : undefined}
      footer={
        <Link className="text-link underline-offset-4 hover:underline" href="/sign-in">
          {t("forgot.back")}
        </Link>
      }
    >
      {emailDelivery ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <FormAlert message={sent ? t("forgot.sent") : null} tone="success" />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
            </Field>
          </FieldGroup>
          <Button type="submit" size="lg" disabled={pending || sent}>
            {t("forgot.submit")}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">{t("forgot.noEmail")}</p>
      )}
    </AuthCard>
  );
}
