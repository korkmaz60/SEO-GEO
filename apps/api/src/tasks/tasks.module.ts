import { Global, Module } from "@nestjs/common";

import { QueueService } from "./queue.service.js";
import { TaskRegistry } from "./task-registry.js";
import { TaskService } from "./task.service.js";

@Global()
@Module({
  providers: [QueueService, TaskRegistry, TaskService],
  exports: [QueueService, TaskRegistry, TaskService],
})
export class TasksModule {}
