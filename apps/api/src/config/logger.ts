import { ConsoleLogger, type LogLevel as NestLogLevel } from "@nestjs/common";

import { LOG_LEVELS, type AppConfig, type LogLevel } from "./env.js";

/** Levels at or above the configured one, in Nest's naming. */
function enabledLevels(level: LogLevel): NestLogLevel[] {
  return LOG_LEVELS.slice(0, LOG_LEVELS.indexOf(level) + 1);
}

/** JSON logs in production (one object per line), readable logs elsewhere. */
export function createLogger(config: Pick<AppConfig, "logLevel" | "nodeEnv">): ConsoleLogger {
  return new ConsoleLogger({
    prefix: "seo-geo",
    json: config.nodeEnv === "production",
    logLevels: enabledLevels(config.logLevel),
  });
}
