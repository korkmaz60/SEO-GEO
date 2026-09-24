"use client";

import { useParams } from "next/navigation";

import { PREVIEW } from "@/lib/preview";

import type { RouteContext } from "./nav-config";

/**
 * Workspace and project slugs from the URL. Workspace-level pages have no project in the
 * URL; until M1 remembers the last project, project links fall back to the preview project.
 */
export function useRouteContext(): RouteContext {
  const params = useParams<{ workspace?: string; project?: string }>();
  return {
    workspace: params.workspace ?? PREVIEW.workspace.slug,
    project: params.project ?? PREVIEW.project.slug,
  };
}
