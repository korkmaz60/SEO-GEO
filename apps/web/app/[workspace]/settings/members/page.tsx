import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MembersSettings } from "@/components/settings/members-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspaceSettings.nav");
  return { title: t("members") };
}

export default function MembersPage() {
  return <MembersSettings />;
}
