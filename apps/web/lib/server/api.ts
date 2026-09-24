import {
  InstanceInfoSchema,
  MeResponseSchema,
  ProjectDetailSchema,
  ProjectSchema,
  ProviderCredentialSchema,
  UsageSummarySchema,
  type MeResponse,
  type Project,
  type ProjectDetail,
  type ProviderCredential,
  type UsageSummary,
  type WorkspaceSummary,
} from "@seo-geo/contracts";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

/** Where server components reach the api directly (not through the proxy route). */
const API_URL = (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

async function request(path: string): Promise<Response> {
  return fetch(`${API_URL}/api/v1${path}`, {
    headers: { accept: "application/json", cookie: (await cookies()).toString() },
    cache: "no-store",
  });
}

/** GET for server components: 401 → sign-in page, 404 → not-found page. */
export async function serverGet<TSchema extends z.ZodType>(
  path: string,
  schema: TSchema,
): Promise<z.output<TSchema>> {
  const response = await request(path);
  if (response.status === 401) redirect("/sign-in");
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return schema.parse(await response.json());
}

/** The signed-in user, or `null` without a session. Cached for the request. */
export const getSession = cache(async (): Promise<MeResponse | null> => {
  const response = await request("/me");
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`GET /me failed with ${response.status}`);
  return MeResponseSchema.parse(await response.json());
});

export async function requireSession(): Promise<MeResponse> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export const getInstance = cache(async () => {
  const response = await fetch(`${API_URL}/api/v1/instance`, { cache: "no-store" });
  if (!response.ok) throw new Error(`GET /instance failed with ${response.status}`);
  return InstanceInfoSchema.parse(await response.json());
});

export async function getWorkspace(slug: string): Promise<WorkspaceSummary> {
  const session = await requireSession();
  const workspace = session.workspaces.find((candidate) => candidate.slug === slug);
  if (!workspace) notFound();
  return workspace;
}

export const getProjects = cache(async (workspaceId: string): Promise<Project[]> => {
  const { data } = await serverGet(
    `/workspaces/${workspaceId}/projects`,
    z.object({ data: z.array(ProjectSchema) }),
  );
  return data;
});

/** An active project of the workspace with its brands; 404 for unknown or archived slugs. */
export const getProject = cache(
  async (workspaceId: string, slug: string): Promise<ProjectDetail> => {
    const project = (await getProjects(workspaceId)).find((candidate) => candidate.slug === slug);
    if (!project) notFound();
    return serverGet(`/workspaces/${workspaceId}/projects/${project.id}`, ProjectDetailSchema);
  },
);

/** Where a signed-in user starts: their first workspace's first project, or onboarding. */
export async function homePath(session: MeResponse): Promise<string> {
  const workspace = session.workspaces[0];
  if (!workspace) return "/onboarding";
  const project = (await getProjects(workspace.id))[0];
  return project
    ? `/${workspace.slug}/${project.slug}/overview`
    : `/onboarding?workspace=${workspace.slug}`;
}

/** Connected providers of the workspace (secrets are never returned). */
export const getCredentials = cache(async (workspaceId: string): Promise<ProviderCredential[]> => {
  const { data } = await serverGet(
    `/workspaces/${workspaceId}/credentials`,
    z.object({ data: z.array(ProviderCredentialSchema) }),
  );
  return data;
});

/** Provider spend of the current month (UTC) with the budget. */
export const getUsage = cache((workspaceId: string): Promise<UsageSummary> =>
  serverGet(`/workspaces/${workspaceId}/usage`, UsageSummarySchema),
);
