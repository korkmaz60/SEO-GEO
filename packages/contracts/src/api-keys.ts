import { z } from "zod";

/**
 * What a workspace API key may do: `read` data, `write` changes that cost nothing, and
 * `run:paid` requests that start paid provider work right away. A key never has more rights
 * than its creator's role in the workspace.
 */
export const ApiScopeSchema = z.enum(["read", "write", "run:paid"]);
export type ApiScope = z.infer<typeof ApiScopeSchema>;
export const API_SCOPES = ApiScopeSchema.options;

/** Validity choices for new keys, in days; `null` never expires. */
export const API_KEY_EXPIRY_DAYS = [30, 90, 365] as const;

export const CreateWorkspaceApiKeySchema = z.strictObject({
  name: z.string().trim().min(1).max(32),
  scopes: z
    .array(ApiScopeSchema)
    .min(1)
    .transform((scopes) => API_SCOPES.filter((scope) => scopes.includes(scope))),
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(365)])
    .nullable()
    .default(90),
});
export type CreateWorkspaceApiKeyInput = z.input<typeof CreateWorkspaceApiKeySchema>;
export type CreateWorkspaceApiKey = z.output<typeof CreateWorkspaceApiKeySchema>;

export const WorkspaceApiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The first characters of the key, e.g. `sg_AbC`. */
  start: z.string().nullable(),
  scopes: z.array(ApiScopeSchema),
  createdBy: z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  /** Whether the caller created the key. */
  own: z.boolean(),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
  lastUsedAt: z.iso.datetime().nullable(),
});
export type WorkspaceApiKey = z.infer<typeof WorkspaceApiKeySchema>;

export const WorkspaceApiKeyListSchema = z.object({ data: z.array(WorkspaceApiKeySchema) });
export type WorkspaceApiKeyList = z.infer<typeof WorkspaceApiKeyListSchema>;

export const CreatedWorkspaceApiKeySchema = WorkspaceApiKeySchema.extend({
  /** The key itself; shown once and never stored in plain text. */
  key: z.string(),
});
export type CreatedWorkspaceApiKey = z.infer<typeof CreatedWorkspaceApiKeySchema>;
