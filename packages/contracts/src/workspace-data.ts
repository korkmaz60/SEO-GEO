import { z } from "zod";

import { ProviderSchema, TaskStatusSchema } from "./domain.js";

// ── Provider credentials ───────────────────────────────────────────────────────

export const CredentialStatusSchema = z.enum(["UNVERIFIED", "VALID", "INVALID"]);
export type CredentialStatus = z.infer<typeof CredentialStatusSchema>;

/** A stored provider key. Secrets are never returned; `details` holds what is safe to show. */
export const ProviderCredentialSchema = z.object({
  id: z.uuid(),
  provider: ProviderSchema,
  label: z.string(),
  status: CredentialStatusSchema,
  details: z.object({
    login: z.string().optional(),
    balanceUsd: z.number().optional(),
  }),
  lastError: z.string().nullable(),
  lastVerifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProviderCredential = z.infer<typeof ProviderCredentialSchema>;

export const SaveDataForSeoCredentialSchema = z.strictObject({
  /** The DataForSEO API login (the account email). */
  login: z.string().trim().min(3).max(254),
  /** The API password from the DataForSEO dashboard, not the account password. */
  password: z.string().min(1).max(256),
});
export type SaveDataForSeoCredential = z.infer<typeof SaveDataForSeoCredentialSchema>;

// ── Usage and budget ─────────────────────────────────────────────────────────────

export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export const BudgetSchema = z.object({
  monthlyLimitUsd: z.number().positive(),
  /** Block paid work at the limit; otherwise only notify. */
  hardStop: z.boolean(),
  /** Percentages of the limit that notify owners and admins. */
  alertThresholds: z.array(z.int().min(1).max(100)),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const UpdateBudgetSchema = z.strictObject({
  monthlyLimitUsd: z.number().positive().max(1_000_000),
  hardStop: z.boolean().default(true),
  alertThresholds: z
    .array(z.int().min(1).max(100))
    .max(5)
    .default([50, 80, 100])
    .transform((values) => [...new Set(values)].sort((a, b) => a - b)),
});
export type UpdateBudget = z.output<typeof UpdateBudgetSchema>;

export const UsageSummarySchema = z.object({
  month: MonthSchema,
  totalUsd: z.number(),
  byProvider: z.array(
    z.object({ provider: ProviderSchema, costUsd: z.number(), operations: z.int() }),
  ),
  budget: BudgetSchema.nullable(),
  /** Spend as a percentage of the budget; `null` without a budget. */
  budgetUsedPercent: z.number().nullable(),
});
export type UsageSummary = z.infer<typeof UsageSummarySchema>;

// ── Tasks ─────────────────────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid().nullable(),
  type: z.string(),
  status: TaskStatusSchema,
  progress: z.int().min(0).max(100),
  result: z.unknown().nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  estimatedCostUsd: z.number().nullable(),
  actualCostUsd: z.number(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const TaskListQuerySchema = z.strictObject({
  status: z
    .string()
    .transform((value) => value.split(","))
    .pipe(z.array(TaskStatusSchema))
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type TaskListQuery = z.output<typeof TaskListQuerySchema>;

// ── Notifications ─────────────────────────────────────────────────────────────────

export const NotificationValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type NotificationValue = z.infer<typeof NotificationValueSchema>;

export const NotificationSchema = z.object({
  id: z.uuid(),
  /** E.g. `budget.threshold` or `credential.invalid`; clients localize by type. */
  type: z.string(),
  /** English fallback text. */
  title: z.string(),
  body: z.string().nullable(),
  /** Values for the localized message. */
  data: z.record(z.string(), NotificationValueSchema),
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Notification = z.infer<typeof NotificationSchema>;

// ── Audit log ─────────────────────────────────────────────────────────────────────

export const AuditEntrySchema = z.object({
  id: z.uuid(),
  action: z.string(),
  actor: z.object({ id: z.uuid(), name: z.string(), email: z.string() }).nullable(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  ip: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
