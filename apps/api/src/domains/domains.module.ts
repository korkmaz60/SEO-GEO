import { Global, Module } from "@nestjs/common";

import { BacklinksService } from "../backlinks/backlinks.service.js";
import { CachedPartsService } from "../providers/cached-parts.service.js";
import { DomainOverviewService } from "./domain-overview.service.js";

/** Domain overview and backlinks, used by the api (and the MCP server). */
@Global()
@Module({
  providers: [CachedPartsService, DomainOverviewService, BacklinksService],
  exports: [CachedPartsService, DomainOverviewService, BacklinksService],
})
export class DomainsModule {}
