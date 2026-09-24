import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module.js";
import { CredentialsModule } from "../credentials/credentials.module.js";
import { CryptoModule } from "../crypto/crypto.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { UsageModule } from "../usage/usage.module.js";

/** Services shared by the api and the worker. All of them are global. */
@Module({
  imports: [
    CryptoModule,
    AuditModule,
    NotificationsModule,
    UsageModule,
    TasksModule,
    CredentialsModule,
  ],
})
export class PlatformServicesModule {}
