import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  MAX_BRAND_SLOTS,
  MAX_COMPETITORS,
  RESERVED_PROJECT_SLUGS,
  type BrandEntity,
  type CompetitorInput,
  type CreateProject,
  type Project,
  type ProjectDetail,
  type UpdateBrand,
  type UpdateProject,
} from "@seo-geo/contracts";
import { registrableDomain, stripWww, tryNormalizeHostname } from "@seo-geo/core";
import { Prisma, type BrandEntity as BrandRow, type Project as ProjectRow } from "@seo-geo/db";

import { AuditService } from "../audit/audit.service.js";
import { ProblemException } from "../common/problem.exception.js";
import type { RequestMeta } from "../common/request-meta.js";
import { iso } from "../common/serialize.js";
import { PrismaService } from "../database/prisma.service.js";

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    slug: row.slug,
    domain: row.domain,
    includeSubdomains: row.includeSubdomains,
    locationCode: row.defaultLocationCode,
    languageCode: row.defaultLanguageCode,
    device: row.defaultDevice,
    timezone: row.timezone,
    archivedAt: iso(row.archivedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toBrand(row: BrandRow): BrandEntity {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    domains: row.domains,
    aliases: row.aliases,
    ambiguousAliases: row.ambiguousAliases,
    colorSlot: row.colorSlot,
  };
}

/** Project and brand entities, always scoped to a workspace. */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(workspaceId: string, includeArchived: boolean): Promise<ProjectRow[]> {
    return this.prisma.project.findMany({
      where: { workspaceId, ...(includeArchived ? {} : { archivedAt: null }) },
      orderBy: { createdAt: "asc" },
    });
  }

  async detail(workspaceId: string, projectId: string): Promise<ProjectDetail> {
    const project = await this.find(workspaceId, projectId);
    const brands = await this.prisma.brandEntity.findMany({
      where: { workspaceId, projectId },
      orderBy: { colorSlot: "asc" },
    });
    return { ...toProject(project), brands: brands.map(toBrand) };
  }

  async create(
    workspaceId: string,
    input: CreateProject,
    meta: RequestMeta,
  ): Promise<ProjectDetail> {
    const domain = projectDomain(input.domain, "domain");
    const ownDomain = registrableDomain(domain) ?? domain;
    const competitors = input.competitors.map((competitor, index) =>
      competitorData(competitor, `competitors.${index}`),
    );
    const slug = input.slug ?? (await this.freeSlug(workspaceId, slugify(domain)));

    const project = await this.inTransaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          workspaceId,
          name: input.name,
          slug,
          domain,
          includeSubdomains: input.includeSubdomains,
          defaultLocationCode: input.locationCode,
          defaultLanguageCode: input.languageCode,
          defaultDevice: input.device,
          timezone: input.timezone,
        },
      });
      await tx.brandEntity.createMany({
        data: [
          {
            workspaceId,
            projectId: created.id,
            kind: "OWN",
            name: input.brand.name ?? input.name,
            domains: [ownDomain],
            aliases: input.brand.aliases,
            colorSlot: 1,
          },
          ...competitors.map((competitor, index) => ({
            workspaceId,
            projectId: created.id,
            kind: "COMPETITOR" as const,
            ...competitor,
            colorSlot: index + 2,
          })),
        ],
      });
      await this.audit.record(
        {
          workspaceId,
          action: "project.created",
          target: { type: "project", id: created.id },
          metadata: { name: created.name, domain },
          meta,
        },
        tx,
      );
      return created;
    });
    return this.detail(workspaceId, project.id);
  }

  async update(
    workspaceId: string,
    projectId: string,
    input: UpdateProject,
  ): Promise<ProjectDetail> {
    await this.find(workspaceId, projectId);
    await this.guardSlug(async () => {
      await this.prisma.project.update({
        where: { id: projectId },
        data: {
          name: input.name,
          slug: input.slug,
          includeSubdomains: input.includeSubdomains,
          defaultLocationCode: input.locationCode,
          defaultLanguageCode: input.languageCode,
          defaultDevice: input.device,
          timezone: input.timezone,
        },
      });
    });
    return this.detail(workspaceId, projectId);
  }

  async setArchived(
    workspaceId: string,
    projectId: string,
    archived: boolean,
    meta: RequestMeta,
  ): Promise<ProjectDetail> {
    const project = await this.find(workspaceId, projectId);
    await this.prisma.project.update({
      where: { id: projectId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await this.audit.record({
      workspaceId,
      action: archived ? "project.archived" : "project.restored",
      target: { type: "project", id: projectId },
      metadata: { name: project.name, domain: project.domain },
      meta,
    });
    return this.detail(workspaceId, projectId);
  }

  async delete(workspaceId: string, projectId: string, meta: RequestMeta): Promise<void> {
    const project = await this.find(workspaceId, projectId);
    await this.inTransaction(async (tx) => {
      await tx.project.delete({ where: { id: project.id } });
      await this.audit.record(
        {
          workspaceId,
          action: "project.deleted",
          target: { type: "project", id: project.id },
          metadata: { name: project.name, domain: project.domain },
          meta,
        },
        tx,
      );
    });
  }

  async addCompetitor(
    workspaceId: string,
    projectId: string,
    input: CompetitorInput & { aliases: string[] },
  ): Promise<BrandEntity> {
    await this.find(workspaceId, projectId);
    const data = competitorData(input, "");
    const used = await this.prisma.brandEntity.findMany({
      where: { workspaceId, projectId },
      select: { colorSlot: true, kind: true },
    });
    if (used.filter((brand) => brand.kind === "COMPETITOR").length >= MAX_COMPETITORS) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: `A project can track up to ${MAX_COMPETITORS} competitors.`,
      });
    }
    const taken = new Set(used.map((brand) => brand.colorSlot));
    const colorSlot =
      Array.from({ length: MAX_BRAND_SLOTS - 1 }, (_, index) => index + 2).find(
        (slot) => !taken.has(slot),
      ) ?? MAX_BRAND_SLOTS;

    const brand = await this.prisma.brandEntity.create({
      data: { workspaceId, projectId, kind: "COMPETITOR", ...data, colorSlot },
    });
    return toBrand(brand);
  }

  async updateBrand(
    workspaceId: string,
    projectId: string,
    brandId: string,
    input: UpdateBrand,
  ): Promise<BrandEntity> {
    await this.findBrand(workspaceId, projectId, brandId);
    const brand = await this.prisma.brandEntity.update({
      where: { id: brandId },
      data: {
        name: input.name,
        aliases: input.aliases,
        ambiguousAliases: input.ambiguousAliases,
        domains: input.domains?.map((domain, index) => brandDomain(domain, `domains.${index}`)),
      },
    });
    return toBrand(brand);
  }

  async deleteBrand(workspaceId: string, projectId: string, brandId: string): Promise<void> {
    const brand = await this.findBrand(workspaceId, projectId, brandId);
    if (brand.kind === "OWN") {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: "The project's own brand cannot be removed.",
      });
    }
    await this.prisma.brandEntity.delete({ where: { id: brandId } });
  }

  /** Loads a project of this workspace or throws 404. */
  async find(workspaceId: string, projectId: string): Promise<ProjectRow> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }

  private async findBrand(
    workspaceId: string,
    projectId: string,
    brandId: string,
  ): Promise<BrandRow> {
    const brand = await this.prisma.brandEntity.findFirst({
      where: { id: brandId, projectId, workspaceId },
    });
    if (!brand) throw ProblemException.notFound("Brand not found.");
    return brand;
  }

  private async freeSlug(workspaceId: string, slugBase: string): Promise<string> {
    const base = (RESERVED_PROJECT_SLUGS as readonly string[]).includes(slugBase)
      ? `${slugBase}-project`
      : slugBase;
    const existing = new Set(
      (
        await this.prisma.project.findMany({
          where: { workspaceId, slug: { startsWith: base } },
          select: { slug: true },
        })
      ).map((project) => project.slug),
    );
    if (!existing.has(base)) return base;
    for (let suffix = 2; ; suffix++) {
      const candidate = `${base.slice(0, 46)}-${suffix}`;
      if (!existing.has(candidate)) return candidate;
    }
  }

  private async inTransaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.guardSlug(() => this.prisma.$transaction(run));
  }

  /** Turns a unique violation on (workspace, slug) into a 409. */
  private async guardSlug<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ProblemException({
          status: HttpStatus.CONFLICT,
          code: ErrorCode.Conflict,
          detail: "Another project in this workspace already uses this slug.",
          errors: [{ path: "slug", message: "Already in use", code: "conflict" }],
        });
      }
      throw error;
    }
  }
}

function projectDomain(input: string, path: string): string {
  const host = tryNormalizeHostname(input);
  if (!host) throw invalidDomain(path);
  return stripWww(host);
}

function brandDomain(input: string, path: string): string {
  const domain = registrableDomain(input);
  if (!domain) throw invalidDomain(path);
  return domain;
}

function competitorData(input: CompetitorInput, pathPrefix: string) {
  const prefix = pathPrefix ? `${pathPrefix}.` : "";
  return {
    name: input.name,
    domains: [
      ...new Set(
        input.domains.map((domain, index) => brandDomain(domain, `${prefix}domains.${index}`)),
      ),
    ],
    aliases: input.aliases ?? [],
    ambiguousAliases: input.ambiguousAliases ?? [],
  };
}

function invalidDomain(path: string): ProblemException {
  return new ProblemException({
    status: HttpStatus.BAD_REQUEST,
    code: ErrorCode.ValidationFailed,
    detail: "The request is not valid.",
    errors: [{ path, message: "Not a public domain name", code: "invalid_domain" }],
  });
}

export function slugify(domain: string): string {
  const slug = domain
    .replace(/^xn--/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
  return slug || "project";
}
