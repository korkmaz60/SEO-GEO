"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";

import { AuthCard } from "./auth-card";
import { FormAlert } from "./form-alert";

export function VerifyEmailNotice() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const next = safeNext(params.get("next"));
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function resend() {
    setPending(true);
    await authClient.sendVerificationEmail({ email, callbackURL: next });
    setPending(false);
    setSent(true);
  }

  return (
    <AuthCard
      title={t("verify.title")}
      footer={
        <Link className="text-link underline-offset-4 hover:underline" href="/sign-in">
          {t("forgot.back")}
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("verify.description", { email })}</p>
        </div>
        <FormAlert message={sent ? t("verify.resent") : null} tone="success" />
        {email && (
          <Button variant="outline" onClick={resend} disabled={pending || sent}>
            {t("verify.resend")}
          </Button>
        )}
      </div>
    </AuthCard>
  );
}
