import { z } from "zod";

import { IssueSeveritySchema } from "./domain.js";

export const AuditRunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
]);
export type AuditRunStatus = z.infer<typeof AuditRunStatusSchema>;

export const MAX_AUDIT_PAGES = 5000;
export const DEFAULT_AUDIT_PAGES = 500;
/** Runs per project whose pages and links are kept; older runs keep their summary only. */
export const AUDIT_RUNS_KEPT = 10;

export const IssueCategorySchema = z.enum([
  "crawlability",
  "indexability",
  "content",
  "links",
  "performance",
  "structured_data",
  "ai_search",
]);
export type IssueCategory = z.infer<typeof IssueCategorySchema>;

export const StartAuditSchema = z.strictObject({
  maxPages: z.int().min(10).max(MAX_AUDIT_PAGES).default(DEFAULT_AUDIT_PAGES),
  /** Clicks from the start page. */
  maxDepth: z.int().min(1).max(20).default(10),
});
export type StartAuditInput = z.input<typeof StartAuditSchema>;
export type StartAudit = z.output<typeof StartAuditSchema>;

export const AuditStatsSchema = z.looseObject({
  crawled: z.int(),
  blocked: z.int(),
  html: z.int(),
  indexable: z.int(),
  status: z.object({
    "2xx": z.int(),
    "3xx": z.int(),
    "4xx": z.int(),
    "5xx": z.int(),
    failed: z.int(),
  }),
  issues: z.object({ ERROR: z.int(), WARNING: z.int(), NOTICE: z.int() }),
  pagesWithErrors: z.int(),
  /** Pages with warnings and no errors. */
  pagesWithWarnings: z.int(),
  stoppedBy: z.enum(["complete", "max_pages", "aborted"]),
  robots: z.object({ found: z.boolean(), unreachable: z.boolean() }),
  sitemaps: z.object({ read: z.int(), failed: z.int(), urls: z.int() }),
  llmsTxt: z.object({ found: z.boolean() }),
});
export type AuditStats = z.infer<typeof AuditStatsSchema>;

export const AuditRunSchema = z.object({
  id: z.uuid(),
  status: AuditRunStatusSchema,
  trigger: z.string(),
  startUrl: z.string(),
  maxPages: z.int(),
  maxDepth: z.int(),
  pagesCrawled: z.int(),
  healthScore: z.int().nullable(),
  scoreVersion: z.int(),
  stats: AuditStatsSchema.nullable(),
  error: z.string().nullable(),
  taskId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().nullable(),
  finishedAt: z.iso.datetime().nullable(),
});
export type AuditRun = z.infer<typeof AuditRunSchema>;

export const AuditIssueSummarySchema = z.object({
  code: z.string(),
  severity: IssueSeveritySchema,
  category: IssueCategorySchema,
  /** Affected pages (1 for site-wide issues). */
  count: z.int(),
  /** Compared with the previous completed run; `null` without one. */
  new: z.int().nullable(),
  fixed: z.int().nullable(),
});
export type AuditIssueSummary = z.infer<typeof AuditIssueSummarySchema>;

export const AuditRunDetailSchema = AuditRunSchema.extend({
  issues: z.array(AuditIssueSummarySchema),
  previous: z
    .object({ id: z.uuid(), healthScore: z.int().nullable(), finishedAt: z.iso.datetime() })
    .nullable(),
});
export type AuditRunDetail = z.infer<typeof AuditRunDetailSchema>;

export const SiteAuditOverviewSchema = z.object({
  /** The newest completed run with its issues. */
  latest: AuditRunDetailSchema.nullable(),
  /** A queued or running run. */
  active: AuditRunSchema.nullable(),
  /** Recent runs, newest first. */
  runs: z.array(AuditRunSchema),
});
export type SiteAuditOverview = z.infer<typeof SiteAuditOverviewSchema>;

export const AuditIssueOccurrenceSchema = z.object({
  pageId: z.uuid().nullable(),
  url: z.string().nullable(),
  data: z.record(z.string(), z.unknown()),
});
export type AuditIssueOccurrence = z.infer<typeof AuditIssueOccurrenceSchema>;

export const AuditPageFilterSchema = z.enum([
  "all",
  "errors",
  "warnings",
  "broken",
  "redirects",
  "noindex",
]);
export type AuditPageFilter = z.infer<typeof AuditPageFilterSchema>;

export const AuditPagesQuerySchema = z.object({
  filter: AuditPageFilterSchema.default("all"),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type AuditPagesQuery = z.output<typeof AuditPagesQuerySchema>;

export const AuditPageRowSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  depth: z.int(),
  statusCode: z.int().nullable(),
  fetchError: z.string().nullable(),
  contentType: z.string().nullable(),
  redirectTarget: z.string().nullable(),
  title: z.string().nullable(),
  indexable: z.boolean(),
  wordCount: z.int().nullable(),
  loadMs: z.int().nullable(),
  inlinks: z.int(),
  schemaTypes: z.array(z.string()),
  issues: z.object({ errors: z.int(), warnings: z.int(), notices: z.int() }),
});
export type AuditPageRow = z.infer<typeof AuditPageRowSchema>;

export const AuditPageListSchema = z.object({
  data: z.array(AuditPageRowSchema),
  total: z.int(),
});
export type AuditPageList = z.infer<typeof AuditPageListSchema>;
