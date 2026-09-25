import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ApiKeysSettings } from "@/components/settings/api-keys-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspaceSettings.nav");
  return { title: t("api") };
}

export default function ApiPage() {
  return <ApiKeysSettings />;
}
