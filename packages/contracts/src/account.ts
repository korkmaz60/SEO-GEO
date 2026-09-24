import { z } from "zod";

import { DeploymentModeSchema, LocaleSchema } from "./common.js";
import { WorkspaceRoleSchema } from "./domain.js";

/** How new people can create an account on this instance. */
export const SignUpModeSchema = z.enum([
  /** Self-hosted, no users yet: the first account becomes the instance's first user. */
  "first-user",
  /** Self-hosted with users: only people with a pending invitation can sign up. */
  "invite-only",
  /** Cloud: anyone can sign up. */
  "open",
]);
export type SignUpMode = z.infer<typeof SignUpModeSchema>;

export const InstanceInfoSchema = z.object({
  version: z.string(),
  deploymentMode: DeploymentModeSchema,
  signUp: SignUpModeSchema,
  /** Whether the server can send email; without it, email verification is skipped. */
  emailDelivery: z.boolean(),
});
export type InstanceInfo = z.infer<typeof InstanceInfoSchema>;

/** Top-level web routes that a workspace slug must not shadow. */
export const RESERVED_WORKSPACE_SLUGS = [
  "account",
  "admin",
  "api",
  "design",
  "docs",
  "forgot-password",
  "help",
  "invite",
  "onboarding",
  "reset-password",
  "sign-in",
  "sign-up",
  "two-factor",
  "verify-email",
] as const;

export const WorkspaceSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/, "Use 1–48 lowercase letters, digits or -")
  .refine(
    (slug) => !(RESERVED_WORKSPACE_SLUGS as readonly string[]).includes(slug),
    "This address is reserved",
  );

export const WorkspaceSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable(),
  role: WorkspaceRoleSchema,
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

export const CurrentUserSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
  locale: LocaleSchema.nullable(),
  twoFactorEnabled: z.boolean(),
});
export type CurrentUser = z.infer<typeof CurrentUserSchema>;

export const MeResponseSchema = z.object({
  user: CurrentUserSchema,
  workspaces: z.array(WorkspaceSummarySchema),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const WorkspaceSchema = WorkspaceSummarySchema.extend({
  createdAt: z.iso.datetime(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Roles ordered from most to least privileged. */
export const WORKSPACE_ROLE_ORDER = WorkspaceRoleSchema.options;

/** Whether `role` grants at least the privileges of `required`. */
export function hasWorkspaceRole(
  role: z.infer<typeof WorkspaceRoleSchema>,
  required: z.infer<typeof WorkspaceRoleSchema>,
): boolean {
  return WORKSPACE_ROLE_ORDER.indexOf(role) <= WORKSPACE_ROLE_ORDER.indexOf(required);
}
