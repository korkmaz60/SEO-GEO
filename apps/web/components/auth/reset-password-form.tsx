"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";

import { AuthCard } from "./auth-card";
import { FormAlert } from "./form-alert";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    !token || params.get("error") ? t("reset.invalid") : null,
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setPending(true);
    setError(null);
    const { error } = await authClient.resetPassword({
      token,
      newPassword: String(new FormData(event.currentTarget).get("password")),
    });
    if (error) {
      setPending(false);
      setError(error.code === "INVALID_TOKEN" ? t("reset.invalid") : te(authErrorKey(error)));
      return;
    }
    router.push("/sign-in?reset=1");
  }

  return (
    <AuthCard
      title={t("reset.title")}
      footer={
        <Link className="text-link underline-offset-4 hover:underline" href="/forgot-password">
          {t("reset.requestNew")}
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormAlert message={error} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">{t("newPassword")}</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
              autoFocus
            />
            <FieldDescription>{t("passwordHint")}</FieldDescription>
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={pending || !token}>
          {t("reset.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
