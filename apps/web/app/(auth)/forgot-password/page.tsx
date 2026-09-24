import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getInstance } from "@/lib/server/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.forgot");
  return { title: t("title") };
}

export default async function ForgotPasswordPage() {
  const instance = await getInstance();
  return <ForgotPasswordForm emailDelivery={instance.emailDelivery} />;
}
