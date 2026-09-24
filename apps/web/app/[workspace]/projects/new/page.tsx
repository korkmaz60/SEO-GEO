import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { NewProject } from "@/components/projects/new-project";
import { PageHeader } from "@/components/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("setup.project");
  return { title: t("title") };
}

export default async function NewProjectPage() {
  const t = await getTranslations("setup.project");
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title={t("pageTitle")} description={t("pageDescription")} />
      <NewProject />
    </div>
  );
}
