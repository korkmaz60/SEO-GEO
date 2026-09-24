import { Global, Module } from "@nestjs/common";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { MAILER, createMailer } from "./mailer.js";

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      useFactory: (config: AppConfig) => createMailer(config),
      inject: [APP_CONFIG],
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
