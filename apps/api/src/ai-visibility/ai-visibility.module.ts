import { Global, Module } from "@nestjs/common";

import { AiModelsService } from "./ai-models.service.js";
import { AiReadModelService } from "./ai-read-model.service.js";
import { AiRunsService } from "./ai-runs.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { PromptsService } from "./prompts.service.js";

/** AI visibility (prompts asked on AI platforms), used by the api and the worker. */
@Global()
@Module({
  providers: [
    AiModelsService,
    AiRunsService,
    AiSettingsService,
    PromptsService,
    AiReadModelService,
  ],
  exports: [AiModelsService, AiRunsService, AiSettingsService, PromptsService, AiReadModelService],
})
export class AiVisibilityModule {}
