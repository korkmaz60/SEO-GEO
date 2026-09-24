import { mkdtemp, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isHeartbeatFresh, startHeartbeat } from "../src/worker-heartbeat.js";

describe("worker heartbeat", () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "heartbeat-"));
    file = join(dir, "worker.heartbeat");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("touches the file only while the check passes", async () => {
    expect(isHeartbeatFresh(file)).toBe(false);

    const stop = startHeartbeat(async () => undefined, { file, intervalMs: 60_000 });
    await vi.waitFor(() => expect(isHeartbeatFresh(file)).toBe(true));
    stop();

    // Old beats go stale.
    const old = new Date(Date.now() - 120_000);
    await utimes(file, old, old);
    expect(isHeartbeatFresh(file)).toBe(false);

    // A failing check (database unreachable) does not refresh the file.
    const failing = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const stopFailing = startHeartbeat(failing, { file, intervalMs: 60_000 });
    await vi.waitFor(() => expect(failing).toHaveBeenCalled());
    stopFailing();
    expect(isHeartbeatFresh(file)).toBe(false);
  });
});
