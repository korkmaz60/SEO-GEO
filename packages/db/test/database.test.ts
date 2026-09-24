import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readdir } from "node:fs/promises";

import { Prisma, createPrismaClient, migrateDeploy, type PrismaClient } from "../src/index.js";
import { createTestDatabase, type TestDatabase } from "../src/testing.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

it.runIf(process.env.CI)("runs the database tests in CI", () => {
  expect(serverUrl, "set TEST_DATABASE_URL").toBeTruthy();
});

describe.skipIf(!serverUrl)("database schema", () => {
  let database: TestDatabase;
  let prisma: PrismaClient;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl as string);
    prisma = createPrismaClient(database.url);
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await database?.drop();
  });

  it("enables row level security on every table", async () => {
    const unprotected = await prisma.$queryRaw<{ table: string }[]>`
      SELECT c.relname AS table
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity`;
    expect(unprotected).toEqual([]);
  });

  it("stores timestamps with time zone", async () => {
    const columns = await prisma.$queryRaw<{ table: string; column: string }[]>`
      SELECT table_name AS table, column_name AS column
      FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'`;
    expect(columns).toEqual([]);
  });

  it("creates workspaces, projects and brands with UUIDv7 ids", async () => {
    const workspace = await prisma.organization.create({ data: { name: "Acme", slug: "acme" } });
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: "Acme",
        slug: "acme-com",
        domain: "acme.com",
        defaultLocationCode: 2792,
        defaultLanguageCode: "tr",
      },
    });
    const brand = await prisma.brandEntity.create({
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        kind: "OWN",
        name: "Acme",
        domains: ["acme.com"],
        aliases: ["Acme Inc"],
        colorSlot: 1,
      },
    });

    expect(workspace.id).toMatch(UUID_V7);
    expect(project.id).toMatch(UUID_V7);
    expect(brand).toMatchObject({ kind: "OWN", domains: ["acme.com"], aliases: ["Acme Inc"] });
  });

  it("keeps project slugs unique per workspace only", async () => {
    const [first, second] = await Promise.all([
      prisma.organization.create({ data: { name: "One", slug: "one" } }),
      prisma.organization.create({ data: { name: "Two", slug: "two" } }),
    ]);
    const project = (workspaceId: string) => ({
      workspaceId,
      name: "Site",
      slug: "site",
      domain: "site.com",
      defaultLocationCode: 2840,
      defaultLanguageCode: "en",
    });

    await prisma.project.create({ data: project(first.id) });
    await expect(prisma.project.create({ data: project(first.id) })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
    await expect(prisma.project.create({ data: project(second.id) })).resolves.toBeTruthy();
  });

  it("deletes a workspace's data with the workspace", async () => {
    const workspace = await prisma.organization.create({ data: { name: "Gone", slug: "gone" } });
    await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name: "Gone",
        slug: "gone",
        domain: "gone.com",
        defaultLocationCode: 2840,
        defaultLanguageCode: "en",
      },
    });
    await prisma.usageEntry.create({
      data: {
        workspaceId: workspace.id,
        provider: "DATAFORSEO",
        operation: "serp.organic",
        costUsd: new Prisma.Decimal("0.0006"),
      },
    });

    await prisma.organization.delete({ where: { id: workspace.id } });

    expect(await prisma.project.count({ where: { workspaceId: workspace.id } })).toBe(0);
    expect(await prisma.usageEntry.count({ where: { workspaceId: workspace.id } })).toBe(0);
  });

  it("keeps provider costs exact", async () => {
    const workspace = await prisma.organization.create({ data: { name: "Cost", slug: "cost" } });
    for (const cost of ["0.000600", "0.001200", "0.002000"]) {
      await prisma.usageEntry.create({
        data: {
          workspaceId: workspace.id,
          provider: "DATAFORSEO",
          operation: "serp.organic",
          costUsd: new Prisma.Decimal(cost),
        },
      });
    }

    const total = await prisma.usageEntry.aggregate({
      where: { workspaceId: workspace.id },
      _sum: { costUsd: true },
    });

    expect(total._sum.costUsd?.toString()).toBe("0.0038");
  });
});

describe.skipIf(!serverUrl)("migrateDeploy", () => {
  it("applies every migration once with the Prisma CLI", async () => {
    const database = await createTestDatabase(serverUrl as string, { migrate: false });
    const prisma = createPrismaClient(database.url);
    try {
      await migrateDeploy(database.url);
      // A second run (another instance starting) finds nothing to do.
      await migrateDeploy(database.url);

      const migrations = (
        await readdir(new URL("../prisma/migrations/", import.meta.url), { withFileTypes: true })
      ).filter((entry) => entry.isDirectory());
      const applied = await prisma.$queryRaw<{ name: string }[]>`
        SELECT migration_name AS name FROM _prisma_migrations
        WHERE finished_at IS NOT NULL ORDER BY migration_name`;
      expect(applied.map((row) => row.name)).toEqual(migrations.map((entry) => entry.name).sort());
      await expect(prisma.user.count()).resolves.toBe(0);
    } finally {
      await prisma.$disconnect();
      await database.drop();
    }
  }, 120_000);
});
