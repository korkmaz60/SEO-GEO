import { Global, Module } from "@nestjs/common";

import { KeywordMetricsService } from "../keywords/keyword-metrics.service.js";
import { RankChecksService } from "./rank-checks.service.js";
import { RankTrackerService } from "./rank-tracker.service.js";

/** Keyword metrics and rank tracking services, used by the api and the worker. */
@Global()
@Module({
  providers: [KeywordMetricsService, RankChecksService, RankTrackerService],
  exports: [KeywordMetricsService, RankChecksService, RankTrackerService],
})
export class RankTrackerModule {}
