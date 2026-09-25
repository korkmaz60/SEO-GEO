import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  type BacklinkBrand,
  type BacklinkCompetitors,
  type BacklinkCompetitorsState,
  type BacklinksLoad,
  type LinkGapDomain,
  type ProjectBacklinks,
  type ProjectBacklinksState,
} from "@seo-geo/contracts";
import type { Project } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  CachedPartsService,
  costOf,
  estimateParts,
  sourceOf,
  type CachedParts,
  type LoadedPart,
  type LoadedParts,
  type PartMap,
  type ProviderPart,
} from "../providers/cached-parts.service.js";
import {
  anchorsPart,
  backlinksPart,
  historyPart,
  linkGapPart,
  newLostPart,
  referringDomainsPart,
  summaryPart,
  type BacklinkTarget,
  type LinkGapValue,
  type SummaryValue,
} from "./backlink-parts.js";

/** The requests a project's backlink profile is made of. */
function profileParts(own: BacklinkTarget, now: Date) {
  return {
    summary: summaryPart(own),
    history: historyPart(own.target, now),
    newLost: newLostPart(own, now),
    referringDomains: referringDomainsPart(own),
    backlinks: backlinksPart(own),
    anchors: anchorsPart(own),
  };
}
type ProfileParts = ReturnType<typeof profileParts>;

function ownTarget(project: Project): BacklinkTarget {
  return { target: project.domain, includeSubdomains: project.includeSubdomains };
}

function isComplete<P extends PartMap>(parts: CachedParts<P>): parts is LoadedParts<P> {
  return Object.values(parts).every((part) => part !== null);
}

/** The estimate of the parts that are not cached, and of loading all of them again. */
function costs(parts: PartMap, cached: Record<string, LoadedPart<unknown> | null>) {
  const all = Object.entries(parts);
  return {
    estimatedCostUsd: estimateParts(all.filter(([key]) => !cached[key]).map(([, part]) => part)),
    refreshCostUsd: estimateParts(all.map(([, part]) => part)),
  };
}

function profileReport(
  project: Project,
  own: BacklinkTarget,
  parts: LoadedParts<ProfileParts>,
): ProjectBacklinks {
  const all = Object.values(parts);
  return {
    projectId: project.id,
    target: own.target,
    includeSubdomains: own.includeSubdomains,
    profile: parts.summary.value.profile,
    history: parts.history.value.months,
    newLost: parts.newLost.value.days,
    referringDomains: parts.referringDomains.value,
    backlinks: parts.backlinks.value,
    anchors: parts.anchors.value,
    source: sourceOf(all),
    costUsd: costOf(all),
  };
}

/** A project's brands in a backlink comparison and the requests the comparison is made of. */
interface Comparison {
  project: Project;
  own: BacklinkTarget;
  /** The project first, then competitors with a domain of their own. */
  brands: BacklinkBrand[];
  parts: Record<string, ProviderPart<SummaryValue | LinkGapValue>>;
  /** Registrable domains of every brand; links from them are no opportunities. */
  brandDomains: string[];
}

const summaryKey = (brandId: string) => `summary:${brandId}`;
const gapKey = (brandId: string) => `gap:${brandId}`;

function isBrandDomain(domain: string, brandDomains: readonly string[]): boolean {
  const host = domain.toLowerCase();
  return brandDomains.some((brand) => host === brand || host.endsWith(`.${brand}`));
}

function comparisonReport(
  comparison: Comparison,
  parts: Record<string, LoadedPart<SummaryValue | LinkGapValue>>,
): BacklinkCompetitors {
  const { project, own, brands, brandDomains } = comparison;
  const summary = (brandId: string) =>
    (parts[summaryKey(brandId)] as LoadedPart<SummaryValue>).value.profile;
  const gap = new Map<string, LinkGapDomain>();
  for (const competitor of brands.slice(1)) {
    const links = (parts[gapKey(competitor.brandId)] as LoadedPart<LinkGapValue>).value.items;
    for (const link of links) {
      if (isBrandDomain(link.domain, brandDomains)) continue;
      const entry = gap.get(link.domain) ?? { domain: link.domain, links: [], rank: null };
      entry.links.push({
        brandId: competitor.brandId,
        rank: link.rank,
        backlinks: link.backlinks,
        firstSeen: link.firstSeen,
      });
      if (link.rank !== null && (entry.rank === null || link.rank > entry.rank)) {
        entry.rank = link.rank;
      }
      gap.set(link.domain, entry);
    }
  }
  const all = Object.values(parts);
  return {
    projectId: project.id,
    target: own.target,
    brands: brands.map((brand) => ({ ...brand, profile: summary(brand.brandId) })),
    linkGap: [...gap.values()].sort(
      (a, b) =>
        b.links.length - a.links.length ||
        (b.rank ?? -1) - (a.rank ?? -1) ||
        a.domain.localeCompare(b.domain),
    ),
    source: sourceOf(all),
    costUsd: costOf(all),
  };
}

/**
 * A project's backlinks (docs/backend.md, "Domain overview and backlinks"): its profile,
 * history, new and lost links and top lists, and separately its competitors' profiles and
 * the link gap. The data is public, cached for every workspace for 7 days; reading what is
 * cached is free, loading the rest is paid, and a refresh loads everything again (D23).
 */
@Injectable()
export class BacklinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parts: CachedPartsService,
  ) {}

  /** The cached profile, if complete, and what loading or refreshing it costs. */
  async state(
    workspaceId: string,
    projectId: string,
    now = new Date(),
  ): Promise<ProjectBacklinksState> {
    const project = await this.project(workspaceId, projectId);
    const own = ownTarget(project);
    const parts = profileParts(own, now);
    const cached = await this.parts.peek(parts, now);
    return {
      target: own.target,
      report: isComplete(cached) ? profileReport(project, own, cached) : null,
      ...costs(parts, cached),
    };
  }

  async load(
    workspaceId: string,
    projectId: string,
    input: BacklinksLoad,
    now = new Date(),
  ): Promise<ProjectBacklinks> {
    const project = await this.project(workspaceId, projectId);
    const own = ownTarget(project);
    const parts = await this.parts.load(workspaceId, profileParts(own, now), {
      refresh: input.refresh,
      projectId: project.id,
      now,
    });
    return profileReport(project, own, parts);
  }

  /** The cached comparison with competitors, if complete, and what loading it costs. */
  async competitorsState(
    workspaceId: string,
    projectId: string,
    now = new Date(),
  ): Promise<BacklinkCompetitorsState> {
    const comparison = await this.comparison(workspaceId, projectId);
    const { own, brands, parts } = comparison;
    if (brands.length < 2) {
      return { target: own.target, brands, report: null, estimatedCostUsd: 0, refreshCostUsd: 0 };
    }
    const cached = await this.parts.peek(parts, now);
    return {
      target: own.target,
      brands,
      report: isComplete(cached) ? comparisonReport(comparison, cached) : null,
      ...costs(parts, cached),
    };
  }

  async loadCompetitors(
    workspaceId: string,
    projectId: string,
    input: BacklinksLoad,
    now = new Date(),
  ): Promise<BacklinkCompetitors> {
    const comparison = await this.comparison(workspaceId, projectId);
    if (comparison.brands.length < 2) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: "Add competitors in the project settings to compare backlinks.",
      });
    }
    const parts = await this.parts.load(workspaceId, comparison.parts, {
      refresh: input.refresh,
      projectId: comparison.project.id,
      now,
    });
    return comparisonReport(comparison, parts);
  }

  private async project(workspaceId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }

  /**
   * The project and each competitor's first domain (a domain counts once), with their
   * backlink summaries and, per competitor, the domains linking to it but not to the project.
   */
  private async comparison(workspaceId: string, projectId: string): Promise<Comparison> {
    const project = await this.project(workspaceId, projectId);
    const own = ownTarget(project);
    const rows = await this.prisma.brandEntity.findMany({
      where: { workspaceId, projectId: project.id },
      orderBy: { colorSlot: "asc" },
    });
    const ownBrand = rows.find((row) => row.kind === "OWN");
    if (!ownBrand) throw new Error(`Project ${project.id} has no own brand`);

    const brands: BacklinkBrand[] = [
      {
        brandId: ownBrand.id,
        kind: "OWN",
        name: ownBrand.name,
        colorSlot: ownBrand.colorSlot,
        domain: own.target,
      },
    ];
    const seen = new Set([own.target]);
    for (const row of rows) {
      const domain = row.domains[0];
      if (row.kind !== "COMPETITOR" || !domain || seen.has(domain)) continue;
      seen.add(domain);
      brands.push({
        brandId: row.id,
        kind: "COMPETITOR",
        name: row.name,
        colorSlot: row.colorSlot,
        domain,
      });
    }

    const parts: Comparison["parts"] = { [summaryKey(ownBrand.id)]: summaryPart(own) };
    for (const competitor of brands.slice(1)) {
      parts[summaryKey(competitor.brandId)] = summaryPart({
        target: competitor.domain,
        includeSubdomains: true,
      });
      parts[gapKey(competitor.brandId)] = linkGapPart(competitor.domain, own.target);
    }
    return {
      project,
      own,
      brands,
      parts,
      brandDomains: [...new Set([own.target, ...rows.flatMap((row) => row.domains)])],
    };
  }
}
