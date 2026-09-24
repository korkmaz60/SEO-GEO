"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { safeNext } from "@/lib/safe-next";

import { AuthCard } from "./auth-card";
import { FormAlert } from "./form-alert";

export function TwoFactorForm() {
  const t = useTranslations("auth.twoFactor");
  const te = useTranslations("errors");
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code")).replace(/\s/g, "");
    setPending(true);
    setError(null);
    const { error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    if (error) {
      setPending(false);
      setError(te(authErrorKey(error)));
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <AuthCard
      title={t("title")}
      description={useBackup ? t("backupDescription") : t("description")}
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormAlert message={error} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="code">{useBackup ? t("backupCode") : t("code")}</FieldLabel>
            <Input
              key={useBackup ? "backup" : "totp"}
              id="code"
              name="code"
              autoComplete="one-time-code"
              inputMode={useBackup ? "text" : "numeric"}
              pattern={useBackup ? undefined : "[0-9 ]{6,7}"}
              className="font-mono tracking-widest"
              required
              autoFocus
            />
          </Field>
          <div className="flex items-center gap-2">
            <Switch id="trust" checked={trustDevice} onCheckedChange={setTrustDevice} />
            <Label htmlFor="trust" className="font-normal">
              {t("trustDevice")}
            </Label>
          </div>
        </FieldGroup>
        <Button type="submit" size="lg" disabled={pending}>
          {t("submit")}
        </Button>
        <Button type="button" variant="link" onClick={() => setUseBackup((value) => !value)}>
          {useBackup ? t("useApp") : t("useBackup")}
        </Button>
      </form>
    </AuthCard>
  );
}
