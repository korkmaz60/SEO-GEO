/**
 * Placeholder context for the M0 interface preview. From M1 on, workspaces and projects come
 * from the api and `/` redirects to the user's last project.
 */
export const PREVIEW = {
  workspace: { slug: "preview", name: "Preview" },
  project: { slug: "example-com", name: "Example", domain: "example.com" },
} as const;

export const PREVIEW_HOME = `/${PREVIEW.workspace.slug}/${PREVIEW.project.slug}/overview`;
