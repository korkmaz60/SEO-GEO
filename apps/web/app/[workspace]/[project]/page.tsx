import { redirect } from "next/navigation";

export default async function ProjectHome({ params }: PageProps<"/[workspace]/[project]">) {
  const { workspace, project } = await params;
  redirect(`/${workspace}/${project}/overview`);
}
