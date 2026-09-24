import { Global, Module } from "@nestjs/common";

import { SiteAuditService } from "./site-audit.service.js";

/** Site audits, used by the api (runs, results) and the worker (crawling). */
@Global()
@Module({ providers: [SiteAuditService], exports: [SiteAuditService] })
export class SiteAuditModule {}
