"use client";

import type { SignUpMode } from "@seo-geo/contracts";
import { Info } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";

import { AuthCard } from "./auth-card";
import { FormAlert } from "./form-alert";
import { withNext } from "./sign-in-form";

export function SignUpForm({ mode, emailDelivery }: { mode: SignUpMode; emailDelivery: boolean }) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email")).trim();
    setPending(true);
    setError(null);

    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email,
      password: String(form.get("password")),
      locale,
      callbackURL: next,
    });
    if (error) {
      setPending(false);
      setError(te(authErrorKey(error)));
      return;
    }
    if (emailDelivery) {
      router.push(
        `/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`,
      );
    } else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <AuthCard
      title={mode === "first-user" ? t("signUp.firstUserTitle") : t("signUp.title")}
      description={
        mode === "first-user" ? t("signUp.firstUserDescription") : t("signUp.description")
      }
      footer={
        <>
          {t("signUp.haveAccount")}{" "}
          <Link
            className="text-link underline-offset-4 hover:underline"
            href={withNext("/sign-in", next)}
          >
            {t("signUp.signInLink")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "invite-only" && (
          <Alert>
            <Info aria-hidden />
            <AlertDescription>{t("signUp.inviteOnly")}</AlertDescription>
          </Alert>
        )}
        <FormAlert message={error} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">{t("name")}</FieldLabel>
            <Input id="name" name="name" autoComplete="name" required maxLength={80} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              maxLength={128}
              required
            />
            <FieldDescription>{t("passwordHint")}</FieldDescription>
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={pending}>
          {t("signUp.submit")}
        </Button>
      </form>
    </AuthCard>
  );
}
