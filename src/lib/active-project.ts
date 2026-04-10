import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ACTIVE_PROJECT_COOKIE_NAME = "seo_geo_active_project";
const ACTIVE_PROJECT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export type ProjectLike = {
  id: string;
};

export async function getActiveProjectIdFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_PROJECT_COOKIE_NAME)?.value ?? null;
}

export function pickActiveProject<T extends ProjectLike>(
  projects: T[],
  activeProjectId?: string | null,
) {
  if (activeProjectId) {
    const activeProject = projects.find((project) => project.id === activeProjectId);
    if (activeProject) return activeProject;
  }

  return projects[0] ?? null;
}

export function applyActiveProjectCookie(
  response: NextResponse,
  projectId: string | null,
) {
  if (!projectId) {
    response.cookies.delete(ACTIVE_PROJECT_COOKIE_NAME);
    return response;
  }

  response.cookies.set({
    name: ACTIVE_PROJECT_COOKIE_NAME,
    value: projectId,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACTIVE_PROJECT_COOKIE_MAX_AGE,
  });

  return response;
}
