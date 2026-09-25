import { Module } from "@nestjs/common";

import { AiVisibilityModule } from "../ai-visibility/ai-visibility.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { CredentialsModule } from "../credentials/credentials.module.js";
import { CryptoModule } from "../crypto/crypto.module.js";
import { DomainsModule } from "../domains/domains.module.js";
import { NetModule } from "../net/net.module.js";
import { GoogleModule } from "../google/google.module.js";
import { KeywordsModule } from "../keywords/keywords.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { RankTrackerModule } from "../rank-tracker/rank-tracker.module.js";
import { SiteAuditModule } from "../site-audit/site-audit.module.js";
import { TasksModule } from "../tasks/tasks.module.js";
import { UsageModule } from "../usage/usage.module.js";

/** Services shared by the api and the worker. All of them are global. */
@Module({
  imports: [
    CryptoModule,
    NetModule,
    AuditModule,
    NotificationsModule,
    UsageModule,
    TasksModule,
    CredentialsModule,
    KeywordsModule,
    DomainsModule,
    RankTrackerModule,
    SiteAuditModule,
    GoogleModule,
    AiVisibilityModule,
  ],
})
export class PlatformServicesModule {}
