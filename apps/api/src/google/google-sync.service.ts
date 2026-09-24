import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { addDays } from "@seo-geo/core";
import type { GoogleConnection, Project, ProjectIntegration } from "@seo-geo/db";

import { PrismaService } from "../database/prisma.service.js";
import { QueueService } from "../tasks/queue.service.js";
import { TaskRegistry } from "../tasks/task-registry.js";
import { GoogleApi } from "./google-api.js";
import { GoogleConnectionsService } from "./google-connections.service.js";

export const GOOGLE_SYNC_JOB = "google.sync";
const GOOGLE_SYNC_DISPATCH = "google.sync.dispatch";

/** Days imported when a property is first connected. */
export const BACKFILL_DAYS = 90;
/** Recent days are imported again: Google finalizes them over two to three days. */
const REFRESH_DAYS = 4;
const GSC_ROW_LIMIT = 25_000;
/** Upper bound on rows imported per dimension and sync, to keep syncs bounded. */
const MAX_ROWS = 250_000;
const GA4_PAGE_SIZE = 100_000;
const INSERT_CHUNK = 5000;

const day = (date: Date) => date.toISOString().slice(0, 10);
const asDate = (value: string) => new Date(`${value}T00:00:00Z`);

/** `20260924` (GA4) → `2026-09-24`. */
function ga4Date(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

type IntegrationWithRelations = ProjectIntegration & {
  connection: GoogleConnection;
  project: Project;
};

/** Imports Search Console and GA4 data into the daily fact tables. */
@Injectable()
export class GoogleSyncService implements OnModuleInit {
  private readonly logger = new Logger("GoogleSync");

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleApi,
    private readonly connections: GoogleConnectionsService,
    private readonly queue: QueueService,
    private readonly registry: TaskRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerJob<{ integrationId: string }>({
      name: GOOGLE_SYNC_JOB,
      handler: (data) => this.sync(data.integrationId),
      queue: { policy: "stately" },
    });
    this.registry.registerScheduledJob({
      name: GOOGLE_SYNC_DISPATCH,
      cron: "40 5 * * *",
      handler: () => this.dispatch(),
    });
  }

  async requestSync(integrationId: string): Promise<void> {
    await this.queue.send(GOOGLE_SYNC_JOB, { integrationId }, { singletonKey: integrationId });
  }

  /** Daily: queues a sync of every integration with a working connection. */
  async dispatch(): Promise<void> {
    const integrations = await this.prisma.projectIntegration.findMany({
      where: { connection: { status: "ACTIVE" }, project: { archivedAt: null } },
      select: { id: true },
    });
    for (const integration of integrations) await this.requestSync(integration.id);
  }

  async sync(integrationId: string, today = day(new Date())): Promise<void> {
    const integration = await this.prisma.projectIntegration.findUnique({
      where: { id: integrationId },
      include: { connection: true, project: true },
    });
    if (!integration || integration.connection.status !== "ACTIVE") return;

    const end = addDays(today, -1);
    const synced = integration.syncedThrough ? day(integration.syncedThrough) : null;
    const backfillStart = addDays(end, -(BACKFILL_DAYS - 1));
    const start = synced
      ? [addDays(synced, -(REFRESH_DAYS - 1)), backfillStart].sort().at(-1)!
      : backfillStart;
    if (start > end) return;

    try {
      const token = await this.connections.accessToken(integration.connection);
      if (integration.type === "GSC")
        await this.importSearchConsole(integration, token, start, end);
      else await this.importAnalytics(integration, token, start, end);
      await this.prisma.projectIntegration.update({
        where: { id: integration.id },
        data: { lastSyncedAt: new Date(), syncedThrough: asDate(end), lastError: null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Sync of ${integration.type} for project ${integration.projectId} failed: ${message}`,
      );
      await this.prisma.projectIntegration.update({
        where: { id: integration.id },
        data: { lastError: message.slice(0, 500) },
      });
    }
  }

  private async importSearchConsole(
    integration: IntegrationWithRelations,
    token: string,
    start: string,
    end: string,
  ): Promise<void> {
    const site = integration.externalId;
    const query = (dimensions: string[]) =>
      this.pagedSearchAnalytics(token, site, { startDate: start, endDate: end, dimensions });
    const [totals, queries, pages] = await Promise.all([
      query(["date"]),
      query(["date", "query"]),
      query(["date", "page"]),
    ]);
    const projectId = integration.projectId;
    const range = { projectId, date: { gte: asDate(start), lte: asDate(end) } };

    await this.prisma.$transaction(
      async (tx) => {
        await tx.gscSiteDaily.deleteMany({ where: range });
        await tx.gscQueryDaily.deleteMany({ where: range });
        await tx.gscPageDaily.deleteMany({ where: range });
        await insertChunks(totals, (batch) =>
          tx.gscSiteDaily.createMany({
            data: batch.map((row) => ({
              projectId,
              date: asDate(row.keys[0] as string),
              clicks: Math.round(row.clicks),
              impressions: Math.round(row.impressions),
              position: row.position,
            })),
          }),
        );
        await insertChunks(queries, (batch) =>
          tx.gscQueryDaily.createMany({
            data: batch.map((row) => ({
              projectId,
              date: asDate(row.keys[0] as string),
              query: (row.keys[1] ?? "").slice(0, 500),
              clicks: Math.round(row.clicks),
              impressions: Math.round(row.impressions),
              position: row.position,
            })),
            skipDuplicates: true,
          }),
        );
        await insertChunks(pages, (batch) =>
          tx.gscPageDaily.createMany({
            data: batch.map((row) => ({
              projectId,
              date: asDate(row.keys[0] as string),
              page: (row.keys[1] ?? "").slice(0, 2000),
              clicks: Math.round(row.clicks),
              impressions: Math.round(row.impressions),
              position: row.position,
            })),
            skipDuplicates: true,
          }),
        );
      },
      { timeout: 5 * 60 * 1000, maxWait: 30_000 },
    );
  }

  private async pagedSearchAnalytics(
    token: string,
    siteUrl: string,
    request: { startDate: string; endDate: string; dimensions: string[] },
  ) {
    const rows: Awaited<ReturnType<GoogleApi["searchAnalytics"]>> = [];
    for (let startRow = 0; startRow < MAX_ROWS; startRow += GSC_ROW_LIMIT) {
      const page = await this.google.searchAnalytics(token, siteUrl, {
        ...request,
        rowLimit: GSC_ROW_LIMIT,
        startRow,
      });
      rows.push(...page);
      if (page.length < GSC_ROW_LIMIT) break;
    }
    return rows;
  }

  private async importAnalytics(
    integration: IntegrationWithRelations,
    token: string,
    start: string,
    end: string,
  ): Promise<void> {
    const rows: { dimensions: string[]; metrics: number[] }[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += GA4_PAGE_SIZE) {
      const report = await this.google.runReport(token, integration.externalId, {
        startDate: start,
        endDate: end,
        dimensions: ["date", "landingPage", "sessionDefaultChannelGroup", "sessionSource"],
        metrics: ["sessions", "totalUsers", "engagedSessions", "keyEvents"],
        limit: GA4_PAGE_SIZE,
        offset,
      });
      rows.push(...report.rows);
      if (offset + report.rows.length >= report.rowCount || report.rows.length === 0) break;
    }
    const projectId = integration.projectId;
    await this.prisma.$transaction(
      async (tx) => {
        await tx.ga4PageDaily.deleteMany({
          where: { projectId, date: { gte: asDate(start), lte: asDate(end) } },
        });
        await insertChunks(rows, (batch) =>
          tx.ga4PageDaily.createMany({
            data: batch.map((row) => ({
              projectId,
              date: asDate(ga4Date(row.dimensions[0] ?? "")),
              page: (row.dimensions[1] || "(not set)").slice(0, 2000),
              channel: (row.dimensions[2] || "(not set)").slice(0, 100),
              source: (row.dimensions[3] || "(not set)").slice(0, 300),
              sessions: Math.round(row.metrics[0] ?? 0),
              users: Math.round(row.metrics[1] ?? 0),
              engagedSessions: Math.round(row.metrics[2] ?? 0),
              keyEvents: row.metrics[3] ?? 0,
            })),
            skipDuplicates: true,
          }),
        );
      },
      { timeout: 5 * 60 * 1000, maxWait: 30_000 },
    );
  }
}

async function insertChunks<T>(
  rows: readonly T[],
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let index = 0; index < rows.length; index += INSERT_CHUNK) {
    await insert(rows.slice(index, index + INSERT_CHUNK));
  }
}
