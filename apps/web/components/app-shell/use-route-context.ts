"use client";

import { useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import type { RouteContext } from "./nav-config";

/** Workspace and project slugs that navigation links are built from. */
export function useRouteContext(): RouteContext {
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  return { workspace: workspace.slug, project: project?.slug ?? null };
}
