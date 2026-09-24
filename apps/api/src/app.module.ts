import { Module, type DynamicModule } from "@nestjs/common";

import { ConfigModule } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";
import { HealthModule } from "./modules/health/health.module.js";

/** Modules loaded when the process runs the HTTP API (`APP_MODE=api`). */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), HealthModule],
    };
  }
}
