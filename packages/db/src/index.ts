import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

export * from "./generated/prisma/client.js";

/**
 * A Prisma client on the node-postgres driver. On Supabase, pass the pooled connection
 * (transaction mode, port 6543); migrations use DIRECT_URL through prisma.config.ts.
 */
export function createPrismaClient(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
