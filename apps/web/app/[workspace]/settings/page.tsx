import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("workspaceSettings");

export default function Page() {
  return <ModulePage pageKey="workspaceSettings" />;
}
