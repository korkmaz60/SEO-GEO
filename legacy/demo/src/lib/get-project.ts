import "server-only";
import { auth } from "@/lib/auth";
import { getActiveProjectIdFromCookies, pickActiveProject } from "@/lib/active-project";
import { db } from "@/lib/db";

export type ProjectContext = {
  userId: string;
  projectId: string;
  project: { id: string; name: string; domain: string };
};

/**
 * Session'dan kullanıcıyı al, aktif projesini döndür.
 * Auth yoksa { auth: false }
 * Auth var proje yoksa { auth: true, noProject: true }
 * Her şey varsa ProjectContext döner
 */
export async function getActiveProject(): Promise<
  | (ProjectContext & { auth: true; noProject: false })
  | { auth: true; noProject: true; userId: string }
  | { auth: false }
> {
  const session = await auth();
  if (!session?.user?.id) return { auth: false };

  const userId = session.user.id;
  const activeProjectId = await getActiveProjectIdFromCookies();

  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const project = pickActiveProject(projects, activeProjectId);

  if (!project) return { auth: true, noProject: true, userId };

  return { auth: true, noProject: false, userId, projectId: project.id, project };
}
