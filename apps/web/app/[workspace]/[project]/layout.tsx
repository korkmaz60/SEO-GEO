import { getProject, getWorkspace } from "@/lib/server/api";

/** Every project page 404s for unknown or archived projects. */
export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/[workspace]/[project]">) {
  const { workspace: workspaceSlug, project: projectSlug } = await params;
  const workspace = await getWorkspace(workspaceSlug);
  await getProject(workspace.id, projectSlug);
  return children;
}
