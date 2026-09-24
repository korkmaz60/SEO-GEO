import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { SignUpForm } from "@/components/auth/sign-up-form";
import { getInstance } from "@/lib/server/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.signUp");
  return { title: t("title") };
}

export default async function SignUpPage() {
  const instance = await getInstance();
  return (
    <Suspense>
      <SignUpForm mode={instance.signUp} emailDelivery={instance.emailDelivery} />
    </Suspense>
  );
}
