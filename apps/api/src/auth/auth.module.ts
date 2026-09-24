import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { PrismaService } from "../database/prisma.service.js";
import { MAILER, type Mailer } from "../mail/mailer.js";
import { AuthGuard } from "./auth.guard.js";
import { AUTH } from "./auth.tokens.js";
import { createAuth } from "./auth.js";
import { WorkspaceGuard } from "./workspace.guard.js";

@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      useFactory: (config: AppConfig, prisma: PrismaService, mailer: Mailer) =>
        createAuth({ config, prisma, mailer }),
      inject: [APP_CONFIG, PrismaService, MAILER],
    },
    { provide: APP_GUARD, useClass: AuthGuard },
    WorkspaceGuard,
  ],
  exports: [AUTH, WorkspaceGuard],
})
export class AuthModule {}
