"use client";

import { ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";

import { BackupCodes } from "./backup-codes";
import { PasswordDialog } from "./password-dialog";

interface Enrollment {
  totpURI: string;
  backupCodes: string[];
}

export function TwoFactorSection({ enabled }: { enabled: boolean }) {
  const t = useTranslations("account.twoFactor");
  const te = useTranslations("errors");
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  async function enable(password: string) {
    const { data, error } = await authClient.twoFactor.enable({ password });
    if (error || !data || !("totpURI" in data) || !data.totpURI) return te(authErrorKey(error));
    setEnrollment({ totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
    return null;
  }

  async function disable(password: string) {
    const { error } = await authClient.twoFactor.disable({ password });
    if (error) return te(authErrorKey(error));
    toast.success(t("disabled"));
    router.refresh();
    return null;
  }

  async function regenerate(password: string) {
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    if (error || !data) return te(authErrorKey(error));
    setNewCodes(data.backupCodes);
    return null;
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      action={
        <Badge variant="outline" className={enabled ? "text-success" : undefined}>
          {enabled ? <ShieldCheck aria-hidden /> : <ShieldOff aria-hidden />}
          {enabled ? t("on") : t("off")}
        </Badge>
      }
      footer={
        enabled ? (
          <>
            <PasswordDialog
              trigger={<Button variant="ghost">{t("disable")}</Button>}
              title={t("disableTitle")}
              description={t("disableBody")}
              confirmLabel={t("disable")}
              destructive
              onConfirm={disable}
            />
            <PasswordDialog
              trigger={<Button variant="outline">{t("regenerate")}</Button>}
              title={t("regenerateTitle")}
              description={t("regenerateBody")}
              confirmLabel={t("regenerate")}
              onConfirm={regenerate}
            />
          </>
        ) : (
          !enrollment && (
            <PasswordDialog
              trigger={<Button>{t("enable")}</Button>}
              title={t("enableTitle")}
              description={t("enableBody")}
              confirmLabel={t("continue")}
              onConfirm={enable}
            />
          )
        )
      }
    >
      {enrollment && !enabled ? (
        <Enroll
          enrollment={enrollment}
          onVerified={() => {
            setEnrollment(null);
            toast.success(t("enabled"));
            router.refresh();
          }}
        />
      ) : newCodes ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("newCodes")}</p>
          <BackupCodes codes={newCodes} />
        </div>
      ) : null}
    </SettingsSection>
  );
}

function Enroll({ enrollment, onVerified }: { enrollment: Enrollment; onVerified: () => void }) {
  const t = useTranslations("account.twoFactor");
  const te = useTranslations("errors");
  const [qr, setQr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const secret = new URL(enrollment.totpURI).searchParams.get("secret") ?? "";

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(enrollment.totpURI, { margin: 1, width: 176 }).then((url) => {
      if (active) setQr(url);
    });
    return () => {
      active = false;
    };
  }, [enrollment.totpURI]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code")).replace(/\s/g, "");
    setPending(true);
    setError(null);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) {
      setError(te(authErrorKey(error)));
      return;
    }
    onVerified();
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col gap-6">
        <li className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("step1")}</p>
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <div className="flex size-44 shrink-0 items-center justify-center rounded-lg bg-white p-1">
              {qr && (
                // A data URL generated on the client; next/image adds nothing here.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={t("qrAlt")} width={176} height={176} />
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">{t("manualEntry")}</p>
              <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all select-all">
                {secret}
              </code>
            </div>
          </div>
        </li>
        <li className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("step2")}</p>
          <BackupCodes codes={enrollment.backupCodes} />
        </li>
        <li className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t("step3")}</p>
          <form onSubmit={verify} className="flex flex-col gap-3">
            <FormAlert message={error} />
            <Field className="max-w-xs">
              <FieldLabel htmlFor="totp-code">{t("code")}</FieldLabel>
              <Input
                id="totp-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                className="font-mono tracking-widest"
                required
              />
              <FieldDescription>{t("codeHint")}</FieldDescription>
            </Field>
            <Button type="submit" className="self-start" disabled={pending}>
              {t("verify")}
            </Button>
          </form>
        </li>
      </ol>
    </div>
  );
}
