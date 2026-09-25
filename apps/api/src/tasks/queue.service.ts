import { Inject, Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import { PgBoss, type Queue, type SendOptions } from "pg-boss";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";
import { TaskRegistry } from "./task-registry.js";

export type QueueOptions = Omit<Queue, "name">;

/**
 * pg-boss on the application database (schema `pgboss`). Started on first use, so processes
 * that never touch the queue never connect. Only the worker runs maintenance and schedules.
 */
@Injectable()
export class QueueService implements OnApplicationShutdown {
  private readonly logger = new Logger("Queue");
  private boss: Promise<PgBoss> | null = null;
  private readonly queues = new Set<string>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly registry: TaskRegistry,
  ) {}

  instance(): Promise<PgBoss> {
    this.boss ??= this.start();
    return this.boss;
  }

  /** Creates the queue with its registered options if needed (idempotent). */
  async ensureQueue(name: string): Promise<void> {
    if (this.queues.has(name)) return;
    await (await this.instance()).createQueue(name, this.registry.queueOptions(name));
    this.queues.add(name);
  }

  async send(name: string, data: object, options: SendOptions = {}): Promise<string | null> {
    await this.ensureQueue(name);
    return (await this.instance()).send(name, data, options);
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.boss) return;
    const boss = await this.boss;
    await boss.stop({ graceful: true, timeout: 20_000 });
  }

  private async start(): Promise<PgBoss> {
    const isWorker = this.config.appMode === "worker";
    const boss = new PgBoss({
      connectionString: this.config.queueDatabaseUrl,
      schema: "pgboss",
      application_name: `seo-geo-${this.config.appMode}`,
      max: isWorker ? 10 : 3,
      supervise: isWorker,
      schedule: isWorker,
    });
    boss.on("error", (error: unknown) => this.logger.error(error));
    await boss.start();
    return boss;
  }
}
