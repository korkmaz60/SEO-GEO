import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ProjectsSettings } from "@/components/settings/projects-settings";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspaceSettings.nav");
  return { title: t("projects") };
}

export default function ProjectsSettingsPage() {
  return <ProjectsSettings />;
}
