import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProvidersSettings } from "@/components/settings/providers-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspaceSettings.nav");
  return { title: t("providers") };
}

export default function ProvidersPage() {
  return <ProvidersSettings />;
}
