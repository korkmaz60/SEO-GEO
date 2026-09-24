import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { UsageSettings } from "@/components/settings/usage-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspaceSettings.nav");
  return { title: t("usage") };
}

export default function UsagePage() {
  return <UsageSettings />;
}
