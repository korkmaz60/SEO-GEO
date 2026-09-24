import { redirect } from "next/navigation";

import { PREVIEW } from "@/lib/preview";

// M0: workspaces have no project list yet; open the preview project.
export default async function WorkspaceHome({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  redirect(`/${workspace}/${PREVIEW.project.slug}/overview`);
}
