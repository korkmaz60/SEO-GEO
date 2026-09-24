import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/app-shell/app-header";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getProjects, getWorkspace, requireSession } from "@/lib/server/api";
import { WorkspaceProvider } from "@/lib/workspace-context";

export default async function WorkspaceLayout({ children, params }: LayoutProps<"/[workspace]">) {
  const { workspace: slug } = await params;
  const [t, session, workspace] = await Promise.all([
    getTranslations("shell"),
    requireSession(),
    getWorkspace(slug),
  ]);
  const projects = await getProjects(workspace.id);
  // Restore the collapsed/expanded state saved by the sidebar component.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <WorkspaceProvider
      value={{ user: session.user, workspaces: session.workspaces, workspace, projects }}
    >
      <SidebarProvider defaultOpen={sidebarOpen}>
        <a
          href="#content"
          className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("skipToContent")}
        </a>
        <AppSidebar />
        <SidebarInset>
          <AppHeader />
          <div id="content" className="flex-1 p-4 md:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceProvider>
  );
}
