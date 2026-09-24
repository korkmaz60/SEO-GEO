import { z } from "zod";

export const LOCALES = ["tr", "en"] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;
export const DEFAULT_LOCALE: Locale = "tr";

/** Which edition this installation runs as. The code is the same for both. */
export const DeploymentModeSchema = z.enum(["selfhost", "cloud"]);
export type DeploymentMode = z.infer<typeof DeploymentModeSchema>;

/** Which part of the backend a process runs. */
export const AppModeSchema = z.enum(["api", "worker"]);
export type AppMode = z.infer<typeof AppModeSchema>;

export const MAX_PAGE_SIZE = 200;

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  cursor: z.string().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Wraps an item schema into the standard cursor-paginated list response. */
export function paginated<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
