import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Loads the repository's `.env` outside production. Variables that are already set win, so
 * real environment variables always take precedence over the file.
 */
export function loadDotEnv(): void {
  if (process.env.NODE_ENV === "production") return;
  const file = fileURLToPath(new URL("../../../../.env", import.meta.url));
  if (existsSync(file)) process.loadEnvFile(file);
}
