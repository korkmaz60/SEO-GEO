"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";

import { AuthCard } from "./auth-card";
import { FormAlert } from "./form-alert";

export function SignInForm() {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("error") ? te("auth.INVALID_TOKEN") : null,
  );
  const [notice, setNotice] = useState<string | null>(params.get("reset") ? t("reset.done") : null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    setPending(true);
    setError(null);
    setNotice(null);

    const { data, error } = await authClient.signIn.email({
      email,
      password: String(form.get("password")),
      callbackURL: next,
    });
    if (error) {
      setPending(false);
      if (error.code === "EMAIL_NOT_VERIFIED") {
        await authClient.sendVerificationEmail({ email, callbackURL: next });
        setNotice(t("signIn.unverified"));
        return;
      }
      setError(te(authErrorKey(error)));
      return;
    }
    // With two-factor authentication the client plugin redirects to /two-factor.
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
    router.push(next);
    router.refresh();
  }

  return (
    <AuthCard
      title={t("signIn.title")}
      description={t("signIn.description")}
      footer={
        <>
          {t("signIn.noAccount")}{" "}
          <Link
            className="text-link underline-offset-4 hover:underline"
            href={withNext("/sign-up", next)}
          >
            {t("signIn.signUpLink")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormAlert message={error} />
        <FormAlert message={notice} tone="success" />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {t("signIn.forgot")}
              </Link>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={pending}>
          {t("signIn.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}

export function withNext(path: string, next: string): string {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}
