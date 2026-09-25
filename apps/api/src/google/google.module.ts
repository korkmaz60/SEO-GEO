import { Global, Module } from "@nestjs/common";

import { GOOGLE_API_OPTIONS, GoogleApi } from "./google-api.js";
import { GoogleConnectionsService } from "./google-connections.service.js";
import { GoogleOAuthClientsService } from "./google-oauth-clients.service.js";
import { GoogleSyncService } from "./google-sync.service.js";
import { ProjectIntegrationsService } from "./project-integrations.service.js";

/** Google accounts, Search Console and GA4 imports; used by the api and the worker. */
@Global()
@Module({
  providers: [
    { provide: GOOGLE_API_OPTIONS, useValue: {} },
    GoogleApi,
    GoogleOAuthClientsService,
    GoogleConnectionsService,
    GoogleSyncService,
    ProjectIntegrationsService,
  ],
  exports: [
    GoogleApi,
    GoogleOAuthClientsService,
    GoogleConnectionsService,
    GoogleSyncService,
    ProjectIntegrationsService,
  ],
})
export class GoogleModule {}
