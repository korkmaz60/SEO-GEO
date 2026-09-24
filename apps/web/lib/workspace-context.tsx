"use client";

import {
  hasWorkspaceRole,
  type CurrentUser,
  type Project,
  type WorkspaceRole,
  type WorkspaceSummary,
} from "@seo-geo/contracts";
import { useParams } from "next/navigation";
import { createContext, use, type ReactNode } from "react";

export interface WorkspaceContextValue {
  user: CurrentUser;
  /** Every workspace the user belongs to, for the switcher. */
  workspaces: WorkspaceSummary[];
  workspace: WorkspaceSummary;
  /** Active (not archived) projects of the workspace. */
  projects: Project[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** Provided by the `[workspace]` layout from server-fetched data. */
export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceContextValue;
  children: ReactNode;
}) {
  return <WorkspaceContext value={value}>{children}</WorkspaceContext>;
}

export function useWorkspace(): WorkspaceContextValue {
  const value = use(WorkspaceContext);
  if (!value) throw new Error("useWorkspace() must be used inside the [workspace] layout");
  return value;
}

/** Whether the current user's role in this workspace grants at least `role`. */
export function useCan(role: WorkspaceRole): boolean {
  return hasWorkspaceRole(useWorkspace().workspace.role, role);
}

/**
 * The project in the URL; on workspace-level pages (research, settings) the first project,
 * so that project links in the navigation keep working. `null` when there are no projects.
 */
export function useCurrentProject(): Project | null {
  const { projects } = useWorkspace();
  const params = useParams<{ project?: string }>();
  return projects.find((project) => project.slug === params.project) ?? projects[0] ?? null;
}
