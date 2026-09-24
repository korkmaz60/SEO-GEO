import { Global, Module } from "@nestjs/common";

import { RankChecksService } from "./rank-checks.service.js";
import { RankTrackerService } from "./rank-tracker.service.js";

/** Rank tracking services, used by the api and the worker. */
@Global()
@Module({
  providers: [RankChecksService, RankTrackerService],
  exports: [RankChecksService, RankTrackerService],
})
export class RankTrackerModule {}
