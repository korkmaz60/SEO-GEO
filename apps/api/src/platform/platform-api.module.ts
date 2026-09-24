import { Module } from "@nestjs/common";

import { AuditController } from "../audit/audit.controller.js";
import { CredentialsController } from "../credentials/credentials.controller.js";
import { NotificationsController } from "../notifications/notifications.controller.js";
import { ProjectsController } from "../projects/projects.controller.js";
import { ProjectsService } from "../projects/projects.service.js";
import { RankTrackerController } from "../rank-tracker/rank-tracker.controller.js";
import { TasksController } from "../tasks/tasks.controller.js";
import { UsageController } from "../usage/usage.controller.js";

/** HTTP endpoints of the platform core (`/api/v1/workspaces/:workspaceId/...`). */
@Module({
  controllers: [
    ProjectsController,
    CredentialsController,
    UsageController,
    TasksController,
    NotificationsController,
    AuditController,
    RankTrackerController,
  ],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class PlatformApiModule {}
