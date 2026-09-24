import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { ConfigError, loadConfig } from "./config/env.js";
import { loadDotEnv } from "./config/load-env.js";
import { createLogger } from "./config/logger.js";
import { WorkerModule } from "./worker.module.js";

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const config = loadConfig({ ...process.env, APP_MODE: "worker" });
  const app = await NestFactory.createApplicationContext(WorkerModule.forRoot(config), {
    logger: createLogger(config),
  });
  // Signals are handled below; app.close() runs the shutdown hooks (pg-boss stop, disconnect).
  await app.init();
  const logger = new Logger("Worker");
  logger.log(`Worker started (${config.deploymentMode})`);

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    logger.log(`Received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };
  process.once("SIGTERM", (signal) => void shutdown(signal));
  process.once("SIGINT", (signal) => void shutdown(signal));
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
