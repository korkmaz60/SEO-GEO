import { getTranslations } from "next-intl/server";

import { pageMetadata } from "@/components/module-page";
import { PageHeader } from "@/components/page-header";
import { ProjectSettings } from "@/components/projects/project-settings";
import { getProject, getWorkspace } from "@/lib/server/api";

export const generateMetadata = pageMetadata("projectSettings");

export default async function ProjectSettingsPage({
  params,
}: PageProps<"/[workspace]/[project]/settings">) {
  const { workspace: workspaceSlug, project: projectSlug } = await params;
  const [t, workspace] = await Promise.all([getTranslations("pages"), getWorkspace(workspaceSlug)]);
  const project = await getProject(workspace.id, projectSlug);
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={t("projectSettings.title")}
        description={t("projectSettings.description")}
      />
      <ProjectSettings key={project.updatedAt} project={project} />
    </div>
  );
}
