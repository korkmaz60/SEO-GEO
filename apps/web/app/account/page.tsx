import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ApiKeysSection } from "@/components/account/api-keys-section";
import { PasswordSection } from "@/components/account/password-section";
import { ProfileSection } from "@/components/account/profile-section";
import { SessionsSection } from "@/components/account/sessions-section";
import { TwoFactorSection } from "@/components/account/two-factor-section";
import { PageHeader } from "@/components/page-header";
import { requireSession } from "@/lib/server/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const [t, { user }] = await Promise.all([getTranslations("account"), requireSession()]);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ProfileSection user={user} />
      <PasswordSection />
      <TwoFactorSection enabled={user.twoFactorEnabled} />
      <ApiKeysSection />
      <SessionsSection />
    </>
  );
}
