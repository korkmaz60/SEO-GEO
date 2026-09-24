import { z } from "zod";

/** Workspace roles, from most to least privileged. */
export const WorkspaceRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;

/** External data and model providers a workspace can connect with its own keys. */
export const ProviderSchema = z.enum([
  "DATAFORSEO",
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE_AI",
  "OPENROUTER",
  "PERPLEXITY",
]);
export type Provider = z.infer<typeof ProviderSchema>;

/** AI answer surfaces measured by the AI visibility module. */
export const AiPlatformSchema = z.enum([
  "CHATGPT",
  "CLAUDE",
  "GEMINI",
  "PERPLEXITY",
  "GOOGLE_AI_OVERVIEW",
  "GOOGLE_AI_MODE",
]);
export type AiPlatform = z.infer<typeof AiPlatformSchema>;

export const DeviceSchema = z.enum(["DESKTOP", "MOBILE"]);
export type Device = z.infer<typeof DeviceSchema>;

export const TaskStatusSchema = z.enum(["queued", "running", "succeeded", "failed", "canceled"]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const IssueSeveritySchema = z.enum(["ERROR", "WARNING", "NOTICE"]);
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
