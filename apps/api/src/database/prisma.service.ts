import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { PrismaClient, createPgAdapter } from "@seo-geo/db";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";

/** The Prisma client as an injectable. Connects lazily on the first query. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({ adapter: createPgAdapter(config.databaseUrl) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
