import { Module } from "@nestjs/common";

import { WorkspacesController } from "../workspaces/workspaces.controller.js";
import { AccountController } from "./account.controller.js";

@Module({ controllers: [AccountController, WorkspacesController] })
export class AccountModule {}
