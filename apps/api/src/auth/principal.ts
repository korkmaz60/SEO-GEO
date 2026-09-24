import type { WorkspaceRole } from "@seo-geo/contracts";
import type { Request } from "express";

import type { Auth } from "./auth.js";

type SessionResult = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

export type AuthUser = SessionResult["user"];
export type AuthSession = SessionResult["session"];

export interface Principal {
  user: AuthUser;
  session: AuthSession;
}

export interface WorkspaceContext {
  id: string;
  role: WorkspaceRole;
}

/** A request after the guards have run. */
export interface AuthenticatedRequest extends Request {
  principal?: Principal;
  workspace?: WorkspaceContext;
}
