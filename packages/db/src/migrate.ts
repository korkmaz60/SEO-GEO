import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/**
 * Applies pending migrations with `prisma migrate deploy`. Prisma takes an advisory lock,
 * so several api instances starting at once do not run a migration twice.
 *
 * `url` needs a session-mode connection (on Supabase: DIRECT_URL, not the transaction
 * pooler).
 */
export async function migrateDeploy(url: string): Promise<void> {
  const cli = require.resolve("prisma/build/index.js");
  const config = fileURLToPath(new URL("../prisma.config.ts", import.meta.url));
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "migrate", "deploy", "--config", config], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        DIRECT_URL: url,
        // No update checks or telemetry from production containers.
        CHECKPOINT_DISABLE: "1",
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
      },
      stdio: ["ignore", "inherit", "inherit"],
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`prisma migrate deploy failed (${signal ?? `exit code ${code}`})`));
    });
  });
}
