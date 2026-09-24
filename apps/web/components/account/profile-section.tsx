"use client";

import { LOCALES, type CurrentUser, type Locale } from "@seo-geo/contracts";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { SettingsSection } from "@/components/settings/settings-section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { setLocale } from "@/i18n/actions";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";

export function ProfileSection({ user }: { user: CurrentUser }) {
  const t = useTranslations("account.profile");
  const tl = useTranslations("shell.languages");
  const te = useTranslations("errors");
  const router = useRouter();
  const currentLocale = useLocale() as Locale;
  const [name, setName] = useState(user.name);
  const [locale, setLocaleValue] = useState<Locale>(user.locale ?? currentLocale);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = LOCALES.map((value) => ({ value, label: tl(value) }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.updateUser({ name: name.trim(), locale });
    if (error) {
      setPending(false);
      setError(te(authErrorKey(error)));
      return;
    }
    await setLocale(locale);
    setPending(false);
    toast.success(t("saved"));
    router.refresh();
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      onSubmit={save}
      footer={
        <Button type="submit" disabled={pending || !name.trim()}>
          {t("save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-name">{t("name")}</FieldLabel>
            <Input
              id="profile-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              maxLength={80}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-email">{t("email")}</FieldLabel>
            <Input id="profile-email" value={user.email} disabled readOnly />
          </Field>
          <Field>
            <FieldLabel>{t("language")}</FieldLabel>
            <Select
              items={items}
              value={locale}
              onValueChange={(value) => value && setLocaleValue(value as Locale)}
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
            <FieldDescription>{t("languageHint")}</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
    </SettingsSection>
  );
}
