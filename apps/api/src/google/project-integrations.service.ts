import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  type AnalyticsData,
  type AnalyticsTotals,
  type IntegrationType,
  type PerformanceData,
  type ProjectIntegration,
  type ProjectIntegrations,
  type SearchConsoleData,
  type SearchTotals,
  type SelectGa4Property,
  type SelectGscSite,
} from "@seo-geo/contracts";
import { addDays, aiReferralName } from "@seo-geo/core";
import type { GoogleConnection, ProjectIntegration as IntegrationRow } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { GoogleApi } from "./google-api.js";
import { GoogleConnectionsService, googleProblem } from "./google-connections.service.js";
import { GoogleSyncService } from "./google-sync.service.js";
import { deleteImportedFacts } from "./imported-facts.js";

const TOP_ROWS = 100;
const ORGANIC_CHANNEL = "Organic Search";

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

function toIntegration(row: IntegrationRow & { connection: GoogleConnection }): ProjectIntegration {
  return {
    type: row.type,
    connectionId: row.connectionId,
    email: row.connection.email,
    connectionStatus: row.connection.status,
    externalId: row.externalId,
    displayName: row.displayName,
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    syncedThrough: row.syncedThrough ? day(row.syncedThrough) : null,
    lastError: row.lastError,
  };
}

interface SearchAggregate {
  clicks: bigint | number | null;
  impressions: bigint | number | null;
  weighted: number | null;
}

function totals(row: SearchAggregate | undefined): SearchTotals {
  const clicks = Number(row?.clicks ?? 0);
  const impressions = Number(row?.impressions ?? 0);
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 && row?.weighted != null ? row.weighted / impressions : null,
  };
}

/** Which Search Console site and GA4 property a project reads, and the data read from them. */
@Injectable()
export class ProjectIntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleApi,
    private readonly connections: GoogleConnectionsService,
    private readonly sync: GoogleSyncService,
  ) {}

  async list(workspaceId: string, projectId: string): Promise<ProjectIntegrations> {
    await this.project(workspaceId, projectId);
    const rows = await this.prisma.projectIntegration.findMany({
      where: { workspaceId, projectId },
      include: { connection: true },
    });
    const byType = (type: IntegrationType) => rows.find((row) => row.type === type);
    const gsc = byType("GSC");
    const ga4 = byType("GA4");
    return { gsc: gsc ? toIntegration(gsc) : null, ga4: ga4 ? toIntegration(ga4) : null };
  }

  async selectGsc(
    workspaceId: string,
    projectId: string,
    input: SelectGscSite,
  ): Promise<ProjectIntegrations> {
    await this.project(workspaceId, projectId);
    const connection = await this.connections.find(workspaceId, input.connectionId);
    const token = await this.connections.accessToken(connection);
    const sites = await this.google.listSites(token).catch((error: unknown) => {
      throw googleProblem(error);
    });
    if (!sites.some((site) => site.siteUrl === input.siteUrl)) {
      throw new ProblemException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.ValidationFailed,
        detail: "This Google account has no access to that Search Console property.",
      });
    }
    await this.save(workspaceId, projectId, "GSC", connection.id, input.siteUrl, input.siteUrl);
    return this.list(workspaceId, projectId);
  }

  async selectGa4(
    workspaceId: string,
    projectId: string,
    input: SelectGa4Property,
  ): Promise<ProjectIntegrations> {
    await this.project(workspaceId, projectId);
    const connection = await this.connections.find(workspaceId, input.connectionId);
    const token = await this.connections.accessToken(connection);
    const properties = await this.google.listGa4Properties(token).catch((error: unknown) => {
      throw googleProblem(error);
    });
    const property = properties.find((entry) => entry.property === input.property);
    if (!property) {
      throw new ProblemException({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ErrorCode.ValidationFailed,
        detail: "This Google account has no access to that Analytics property.",
      });
    }
    await this.save(
      workspaceId,
      projectId,
      "GA4",
      connection.id,
      property.property,
      property.displayName,
    );
    return this.list(workspaceId, projectId);
  }

  /** Disconnects a source from the project and deletes its imported data. */
  async remove(workspaceId: string, projectId: string, type: IntegrationType): Promise<void> {
    await this.project(workspaceId, projectId);
    await this.prisma.$transaction([
      this.prisma.projectIntegration.deleteMany({ where: { workspaceId, projectId, type } }),
      ...deleteImportedFacts(this.prisma, projectId, type),
    ]);
  }

  async syncNow(workspaceId: string, projectId: string): Promise<void> {
    await this.project(workspaceId, projectId);
    const rows = await this.prisma.projectIntegration.findMany({
      where: { workspaceId, projectId },
      select: { id: true },
    });
    for (const row of rows) await this.sync.requestSync(row.id);
  }

  async performance(
    workspaceId: string,
    projectId: string,
    days: number,
  ): Promise<PerformanceData> {
    const integrations = await this.list(workspaceId, projectId);
    const gscEnd = integrations.gsc?.syncedThrough;
    const ga4End = integrations.ga4?.syncedThrough;
    return {
      googleConfigured: this.google.configured,
      integrations,
      searchConsole: gscEnd ? await this.searchConsole(projectId, gscEnd, days) : null,
      analytics: ga4End ? await this.analytics(projectId, ga4End, days) : null,
    };
  }

  private async save(
    workspaceId: string,
    projectId: string,
    type: IntegrationType,
    connectionId: string,
    externalId: string,
    displayName: string,
  ): Promise<void> {
    const existing = await this.prisma.projectIntegration.findUnique({
      where: { projectId_type: { projectId, type } },
    });
    const changed = existing !== null && existing.externalId !== externalId;
    const integration = await this.prisma.$transaction(async (tx) => {
      // Data of a previous property would mix with the new one; without a source, any rows
      // left are stale.
      if (changed || !existing) {
        for (const operation of deleteImportedFacts(tx, projectId, type)) await operation;
      }
      const data = {
        connectionId,
        externalId,
        displayName,
        lastError: null,
        ...(changed || !existing ? { syncedThrough: null, lastSyncedAt: null } : {}),
      };
      return tx.projectIntegration.upsert({
        where: { projectId_type: { projectId, type } },
        create: { workspaceId, projectId, type, ...data },
        update: data,
      });
    });
    await this.sync.requestSync(integration.id);
  }

  private async searchConsole(
    projectId: string,
    end: string,
    days: number,
  ): Promise<SearchConsoleData> {
    const start = addDays(end, -(days - 1));
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -(days - 1));
    const aggregate = (from: string, to: string) =>
      this.prisma.$queryRaw<SearchAggregate[]>`
        SELECT SUM(clicks) AS clicks, SUM(impressions) AS impressions,
          SUM(position * impressions) AS weighted
        FROM gsc_site_daily
        WHERE project_id = ${projectId}::uuid AND date BETWEEN ${from}::date AND ${to}::date`;
    const [current, previous, daily] = await Promise.all([
      aggregate(start, end),
      aggregate(previousStart, previousEnd),
      this.prisma.gscSiteDaily.findMany({
        where: { projectId, date: { gte: asDate(start), lte: asDate(end) } },
        orderBy: { date: "asc" },
      }),
    ]);
    const byDate = new Map(daily.map((row) => [day(row.date), row]));
    const series: SearchConsoleData["daily"] = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const row = byDate.get(date);
      series.push({
        date,
        ...totals(
          row
            ? {
                clicks: row.clicks,
                impressions: row.impressions,
                weighted: row.position * row.impressions,
              }
            : undefined,
        ),
      });
    }
    return {
      range: { start, end },
      totals: totals(current[0]),
      previous: totals(previous[0]),
      daily: series,
      queries: (
        await this.topRows(
          "gsc_query_daily",
          "query",
          projectId,
          start,
          end,
          previousStart,
          previousEnd,
        )
      ).map(({ key, ...row }) => ({ query: key, ...row })),
      pages: (
        await this.topRows(
          "gsc_page_daily",
          "page",
          projectId,
          start,
          end,
          previousStart,
          previousEnd,
        )
      ).map(({ key, ...row }) => ({ page: key, ...row })),
    };
  }

  private async topRows(
    table: "gsc_query_daily" | "gsc_page_daily",
    column: "query" | "page",
    projectId: string,
    start: string,
    end: string,
    previousStart: string,
    previousEnd: string,
  ) {
    const tableSql = table === "gsc_query_daily" ? "gsc_query_daily" : "gsc_page_daily";
    const columnSql = column === "query" ? "query" : "page";
    // Table and column names come from the two literals above, never from input.
    const rows = await this.prisma.$queryRawUnsafe<(SearchAggregate & { key: string })[]>(
      `SELECT ${columnSql} AS key, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
         SUM(position * impressions) AS weighted
       FROM ${tableSql}
       WHERE project_id = $1::uuid AND date BETWEEN $2::date AND $3::date
       GROUP BY ${columnSql}
       ORDER BY SUM(clicks) DESC, SUM(impressions) DESC
       LIMIT ${TOP_ROWS}`,
      projectId,
      start,
      end,
    );
    const previous = rows.length
      ? await this.prisma.$queryRawUnsafe<(SearchAggregate & { key: string })[]>(
          `SELECT ${columnSql} AS key, SUM(clicks) AS clicks, SUM(impressions) AS impressions,
             SUM(position * impressions) AS weighted
           FROM ${tableSql}
           WHERE project_id = $1::uuid AND date BETWEEN $2::date AND $3::date
             AND ${columnSql} = ANY($4::text[])
           GROUP BY ${columnSql}`,
          projectId,
          previousStart,
          previousEnd,
          rows.map((row) => row.key),
        )
      : [];
    const before = new Map(previous.map((row) => [row.key, totals(row)]));
    return rows.map((row) => {
      const earlier = before.get(row.key);
      return {
        key: row.key,
        ...totals(row),
        previousClicks: earlier ? earlier.clicks : null,
        previousPosition: earlier ? earlier.position : null,
      };
    });
  }

  private async analytics(projectId: string, end: string, days: number): Promise<AnalyticsData> {
    const start = addDays(end, -(days - 1));
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -(days - 1));

    const bySource = (from: string, to: string) =>
      this.prisma.$queryRaw<
        { source: string; channel: string; sessions: bigint; engaged: bigint; keyEvents: number }[]
      >`
        SELECT source, channel, SUM(sessions) AS sessions, SUM(engaged_sessions) AS engaged,
          SUM(key_events) AS "keyEvents"
        FROM ga4_page_daily
        WHERE project_id = ${projectId}::uuid AND date BETWEEN ${from}::date AND ${to}::date
        GROUP BY source, channel`;
    const [current, previous, daily, pages] = await Promise.all([
      bySource(start, end),
      bySource(previousStart, previousEnd),
      this.prisma.$queryRaw<{ date: Date; source: string; channel: string; sessions: bigint }[]>`
        SELECT date, source, channel, SUM(sessions) AS sessions
        FROM ga4_page_daily
        WHERE project_id = ${projectId}::uuid AND date BETWEEN ${start}::date AND ${end}::date
        GROUP BY date, source, channel`,
      this.prisma.$queryRaw<{ page: string; sessions: bigint; organic: bigint; engaged: bigint }[]>`
        SELECT page, SUM(sessions) AS sessions,
          SUM(sessions) FILTER (WHERE channel = ${ORGANIC_CHANNEL}) AS organic,
          SUM(engaged_sessions) AS engaged
        FROM ga4_page_daily
        WHERE project_id = ${projectId}::uuid AND date BETWEEN ${start}::date AND ${end}::date
        GROUP BY page
        ORDER BY SUM(sessions) DESC
        LIMIT ${TOP_ROWS}`,
    ]);

    const summarize = (rows: typeof current): AnalyticsTotals => {
      const result = {
        sessions: 0,
        engagedSessions: 0,
        keyEvents: 0,
        organicSessions: 0,
        aiSessions: 0,
      };
      for (const row of rows) {
        const sessions = Number(row.sessions);
        result.sessions += sessions;
        result.engagedSessions += Number(row.engaged);
        result.keyEvents += Number(row.keyEvents);
        if (row.channel === ORGANIC_CHANNEL) result.organicSessions += sessions;
        if (aiReferralName(row.source)) result.aiSessions += sessions;
      }
      return result;
    };

    const referrals = new Map<string, { sessions: number; previousSessions: number }>();
    const addReferral = (rows: typeof current, field: "sessions" | "previousSessions") => {
      for (const row of rows) {
        const name = aiReferralName(row.source);
        if (!name) continue;
        const entry = referrals.get(name) ?? { sessions: 0, previousSessions: 0 };
        entry[field] += Number(row.sessions);
        referrals.set(name, entry);
      }
    };
    addReferral(current, "sessions");
    addReferral(previous, "previousSessions");

    const perDay = new Map<
      string,
      { sessions: number; organicSessions: number; aiSessions: number }
    >();
    for (const row of daily) {
      const date = day(row.date);
      const entry = perDay.get(date) ?? { sessions: 0, organicSessions: 0, aiSessions: 0 };
      const sessions = Number(row.sessions);
      entry.sessions += sessions;
      if (row.channel === ORGANIC_CHANNEL) entry.organicSessions += sessions;
      if (aiReferralName(row.source)) entry.aiSessions += sessions;
      perDay.set(date, entry);
    }
    const series: AnalyticsData["daily"] = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      series.push({
        date,
        ...(perDay.get(date) ?? { sessions: 0, organicSessions: 0, aiSessions: 0 }),
      });
    }

    return {
      range: { start, end },
      totals: summarize(current),
      previous: summarize(previous),
      daily: series,
      landingPages: pages.map((row) => ({
        page: row.page,
        sessions: Number(row.sessions),
        organicSessions: Number(row.organic ?? 0),
        engagedSessions: Number(row.engaged),
      })),
      aiReferrals: [...referrals]
        .map(([name, entry]) => ({ name, ...entry }))
        .sort((a, b) => b.sessions - a.sessions),
    };
  }

  private async project(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }
}
