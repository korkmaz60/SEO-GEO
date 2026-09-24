import { statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Liveness for the worker, which has no HTTP port: while it can reach the database it
 * touches a file, and the container health check (`dist/worker-health.js`) looks at how
 * old that file is.
 */
export const HEARTBEAT_FILE =
  process.env.WORKER_HEARTBEAT_FILE ?? join(tmpdir(), "seo-geo-worker.heartbeat");
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Four missed beats in a row make the worker unhealthy. */
export const HEARTBEAT_MAX_AGE_MS = 60_000;

/** Runs `check` now and then every `intervalMs`; the file is touched only when it passes. */
export function startHeartbeat(
  check: () => Promise<unknown>,
  { file = HEARTBEAT_FILE, intervalMs = HEARTBEAT_INTERVAL_MS } = {},
): () => void {
  const beat = async () => {
    try {
      await check();
      await writeFile(file, String(Date.now()));
    } catch {
      // A missed beat is the signal; the health check reports it once the file is stale.
    }
  };
  void beat();
  const timer = setInterval(() => void beat(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

export function isHeartbeatFresh(
  file = HEARTBEAT_FILE,
  now = Date.now(),
  maxAgeMs = HEARTBEAT_MAX_AGE_MS,
): boolean {
  try {
    return now - statSync(file).mtimeMs < maxAgeMs;
  } catch {
    return false;
  }
}
