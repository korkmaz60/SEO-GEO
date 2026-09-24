import { WorkspaceGeneralSettings } from "@/components/settings/workspace-general";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("workspaceSettings");

export default function WorkspaceSettingsPage() {
  return <WorkspaceGeneralSettings />;
}
