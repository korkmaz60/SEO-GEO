import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const MIGRATIONS_DIR = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));

export interface TestDatabase {
  name: string;
  url: string;
  drop(): Promise<void>;
}

/**
 * Creates an empty database next to the one in `serverUrl`, applies every migration and
 * returns its URL. The role in `serverUrl` needs the CREATEDB privilege.
 */
export async function createTestDatabase(serverUrl: string): Promise<TestDatabase> {
  const name = `seogeo_test_${randomBytes(6).toString("hex")}`;
  await withClient(serverUrl, (client) => client.query(`CREATE DATABASE "${name}"`));

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  const database: TestDatabase = {
    name,
    url: url.toString(),
    drop: () =>
      withClient(serverUrl, (client) =>
        client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
      ).then(() => undefined),
  };

  try {
    await applyMigrations(database.url);
  } catch (error) {
    await database.drop();
    throw error;
  }
  return database;
}

/** Runs the SQL of every migration in order, the way `prisma migrate deploy` would. */
export async function applyMigrations(url: string): Promise<void> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  await withClient(url, async (client) => {
    for (const migration of migrations) {
      await client.query(await readFile(join(MIGRATIONS_DIR, migration, "migration.sql"), "utf8"));
    }
  });
}

async function withClient<T>(url: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}
