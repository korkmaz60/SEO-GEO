import { redirect } from "next/navigation";

export default async function ProjectHome({
  params,
}: {
  params: Promise<{ workspace: string; project: string }>;
}) {
  const { workspace, project } = await params;
  redirect(`/${workspace}/${project}/overview`);
}
