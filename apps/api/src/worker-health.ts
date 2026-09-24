// Container health check for the worker: `node dist/worker-health.js` exits 0 while the
// worker's heartbeat is fresh.
import { isHeartbeatFresh } from "./worker-heartbeat.js";

process.exit(isHeartbeatFresh() ? 0 : 1);
