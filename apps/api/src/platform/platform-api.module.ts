import { Module } from "@nestjs/common";

import { AiVisibilityController } from "../ai-visibility/ai-visibility.controller.js";
import { WorkspaceApiKeysController } from "../api-keys/workspace-api-keys.controller.js";
import { WorkspaceApiKeysService } from "../api-keys/workspace-api-keys.service.js";
import { AuditController } from "../audit/audit.controller.js";
import { CredentialsController } from "../credentials/credentials.controller.js";
import {
  GoogleCallbackController,
  GoogleConnectionsController,
  ProjectIntegrationsController,
} from "../google/google.controller.js";
import {
  KeywordListsController,
  KeywordResearchController,
} from "../keywords/keyword-research.controller.js";
import { McpController } from "../mcp/mcp.controller.js";
import { McpService } from "../mcp/mcp.service.js";
import { NotificationsController } from "../notifications/notifications.controller.js";
import { ProjectsController } from "../projects/projects.controller.js";
import { ProjectsService } from "../projects/projects.service.js";
import { RankTrackerController } from "../rank-tracker/rank-tracker.controller.js";
import { SiteAuditController } from "../site-audit/site-audit.controller.js";
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
    KeywordResearchController,
    KeywordListsController,
    SiteAuditController,
    GoogleCallbackController,
    GoogleConnectionsController,
    ProjectIntegrationsController,
    AiVisibilityController,
    WorkspaceApiKeysController,
    McpController,
  ],
  providers: [ProjectsService, WorkspaceApiKeysService, McpService],
  exports: [ProjectsService],
})
export class PlatformApiModule {}
