import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { defineConfig } from "prisma/config";

// Prisma does not read .env files; load the repository's one for local development.
const envFile = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Migrations need a direct (session) connection; on Supabase the pooled DATABASE_URL
  // runs in transaction mode, so DIRECT_URL is preferred when set.
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL },
});
