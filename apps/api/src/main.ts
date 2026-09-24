import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { migrateDeploy } from "@seo-geo/db";

import { AppModule } from "./app.module.js";
import { API_PREFIX, configureApp } from "./app.setup.js";
import { ConfigError, loadConfig } from "./config/env.js";
import { loadDotEnv } from "./config/load-env.js";
import { createLogger } from "./config/logger.js";

async function bootstrap(): Promise<void> {
  loadDotEnv();
  const config = loadConfig();
  const logger = createLogger(config);
  if (config.migrateOnStart) {
    logger.log("Applying database migrations", "Bootstrap");
    await migrateDeploy(config.queueDatabaseUrl);
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    logger,
    bodyParser: false,
  });
  configureApp(app, config);
  app.enableShutdownHooks();

  await app.listen(config.port, config.host);
  Logger.log(
    `API listening on http://${config.host}:${config.port}/${API_PREFIX} (${config.deploymentMode})`,
    "Bootstrap",
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
