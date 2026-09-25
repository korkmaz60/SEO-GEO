import { Global, Module } from "@nestjs/common";

import { DomainOverviewService } from "./domain-overview.service.js";

/** Domain overview and backlinks, used by the api (and the MCP server). */
@Global()
@Module({
  providers: [DomainOverviewService],
  exports: [DomainOverviewService],
})
export class DomainsModule {}
