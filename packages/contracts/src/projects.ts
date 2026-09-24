import { z } from "zod";

import { DeviceSchema } from "./domain.js";

/** Chart slots of the categorical palette; the own brand is always slot 1. */
export const MAX_BRAND_SLOTS = 8;
export const MAX_COMPETITORS = MAX_BRAND_SLOTS - 1;

/** Workspace-level web routes that a project slug must not shadow. */
export const RESERVED_PROJECT_SLUGS = [
  "account",
  "new",
  "projects",
  "research",
  "settings",
] as const;

export const ProjectSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/, "Use 1–50 lowercase letters, digits or -")
  .refine(
    (slug) => !(RESERVED_PROJECT_SLUGS as readonly string[]).includes(slug),
    "This address is reserved",
  );

const NameSchema = z.string().trim().min(1).max(80);
const AliasesSchema = z.array(z.string().trim().min(1).max(80)).max(20);
/** A website address or host; normalized by the server. */
const DomainInputSchema = z.string().trim().min(3).max(253);

/** DataForSEO location code, e.g. 2792 for Turkey or 2840 for the United States. */
export const LocationCodeSchema = z.int().min(1).max(99_999_999);
/** DataForSEO language code, e.g. `tr`, `en`, `pt-BR`. */
export const LanguageCodeSchema = z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/);

export const TimezoneSchema = z.string().refine(isTimeZone, "Unknown time zone");

export const BrandKindSchema = z.enum(["OWN", "COMPETITOR"]);
export type BrandKind = z.infer<typeof BrandKindSchema>;

export const BrandEntitySchema = z.object({
  id: z.uuid(),
  kind: BrandKindSchema,
  name: z.string(),
  /** Registrable domains that count as this brand. */
  domains: z.array(z.string()),
  aliases: z.array(z.string()),
  /** Categorical chart slot, 1–8. */
  colorSlot: z.int().min(1).max(MAX_BRAND_SLOTS),
});
export type BrandEntity = z.infer<typeof BrandEntitySchema>;

export const ProjectSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  name: z.string(),
  slug: ProjectSlugSchema,
  /** Normalized host without `www.`. */
  domain: z.string(),
  includeSubdomains: z.boolean(),
  locationCode: LocationCodeSchema,
  languageCode: LanguageCodeSchema,
  device: DeviceSchema,
  timezone: z.string(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectDetailSchema = ProjectSchema.extend({
  brands: z.array(BrandEntitySchema),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const CompetitorInputSchema = z.strictObject({
  name: NameSchema,
  domains: z.array(DomainInputSchema).min(1).max(10),
  aliases: AliasesSchema.default([]),
});
export type CompetitorInput = z.input<typeof CompetitorInputSchema>;

export const CreateProjectSchema = z.strictObject({
  name: NameSchema,
  domain: DomainInputSchema,
  /** Derived from the domain when omitted. */
  slug: ProjectSlugSchema.optional(),
  includeSubdomains: z.boolean().default(true),
  locationCode: LocationCodeSchema,
  languageCode: LanguageCodeSchema,
  device: DeviceSchema.default("DESKTOP"),
  timezone: TimezoneSchema.default("UTC"),
  /** The own brand; its name defaults to the project name and its domain to the project's. */
  brand: z
    .strictObject({ name: NameSchema.optional(), aliases: AliasesSchema.default([]) })
    .default({ aliases: [] }),
  competitors: z.array(CompetitorInputSchema).max(MAX_COMPETITORS).default([]),
});
export type CreateProjectInput = z.input<typeof CreateProjectSchema>;
export type CreateProject = z.output<typeof CreateProjectSchema>;

export const UpdateProjectSchema = z
  .strictObject({
    name: NameSchema,
    slug: ProjectSlugSchema,
    includeSubdomains: z.boolean(),
    locationCode: LocationCodeSchema,
    languageCode: LanguageCodeSchema,
    device: DeviceSchema,
    timezone: TimezoneSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdateProject = z.output<typeof UpdateProjectSchema>;

export const UpdateBrandSchema = z
  .strictObject({
    name: NameSchema,
    domains: z.array(DomainInputSchema).min(1).max(10),
    aliases: AliasesSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");
export type UpdateBrand = z.output<typeof UpdateBrandSchema>;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
