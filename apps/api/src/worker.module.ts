import { Module, type DynamicModule } from "@nestjs/common";

import { ConfigModule } from "./config/config.module.js";
import type { AppConfig } from "./config/env.js";
import { DatabaseModule } from "./database/database.module.js";
import { MailModule } from "./mail/mail.module.js";
import { PlatformServicesModule } from "./platform/platform-services.module.js";
import { TASK_POLLING_SECONDS, TaskRunner } from "./tasks/task-runner.service.js";

/** Modules loaded when the process runs background jobs (`APP_MODE=worker`). */
@Module({})
export class WorkerModule {
  static forRoot(
    config: AppConfig,
    options: { pollingIntervalSeconds?: number } = {},
  ): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.forRoot(config), DatabaseModule, MailModule, PlatformServicesModule],
      providers: [
        { provide: TASK_POLLING_SECONDS, useValue: options.pollingIntervalSeconds ?? 2 },
        TaskRunner,
      ],
    };
  }
}
