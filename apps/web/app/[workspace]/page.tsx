import { hasWorkspaceRole } from "@seo-geo/contracts";
import { FolderPlus } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/components/data/empty-state";
import { getProjects, getWorkspace } from "@/lib/server/api";

/** A workspace opens its first project; without projects, admins create one. */
export default async function WorkspaceHome({ params }: PageProps<"/[workspace]">) {
  const { workspace: slug } = await params;
  const workspace = await getWorkspace(slug);
  const [project] = await getProjects(workspace.id);
  if (project) redirect(`/${workspace.slug}/${project.slug}/overview`);
  if (hasWorkspaceRole(workspace.role, "admin")) redirect(`/${workspace.slug}/projects/new`);

  const t = await getTranslations("workspaceHome");
  return (
    <div className="mx-auto w-full max-w-3xl pt-8">
      <EmptyState icon={FolderPlus} title={t("emptyTitle")} description={t("emptyBody")} />
    </div>
  );
}
