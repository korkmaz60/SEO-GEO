import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";
export { migrateDeploy } from "./migrate.js";

/**
 * The node-postgres driver adapter. On Supabase, pass the pooled connection (transaction
 * mode, port 6543); migrations use DIRECT_URL through prisma.config.ts.
 */
export function createPgAdapter(url: string): PrismaPg {
  return new PrismaPg({ connectionString: url });
}

export function createPrismaClient(url: string): PrismaClient {
  return new PrismaClient({ adapter: createPgAdapter(url) });
}
