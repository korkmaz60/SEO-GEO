import { Module, type DynamicModule } from "@nestjs/common";

import { ConfigModule } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";

/**
 * Modules loaded when the process runs background jobs (`APP_MODE=worker`).
 * Queue consumers (pg-boss) are registered here from M1 on.
 */
@Module({})
export class WorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule],
    };
  }
}
