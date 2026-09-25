import type { ApiScope, WorkspaceRole } from "@seo-geo/contracts";
import type { Request } from "express";

import type { Auth } from "./auth.js";

type SessionResult = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

export type AuthUser = SessionResult["user"];
export type AuthSession = SessionResult["session"];

/** The API key a request was made with. */
export interface ApiKeyAccess {
  id: string;
  /** Workspace keys work in this workspace only; personal keys (`null`) in all of the user's. */
  workspaceId: string | null;
  /** Workspace keys are limited to these; personal keys (`null`) have every scope. */
  scopes: ApiScope[] | null;
}

export interface Principal {
  user: AuthUser;
  session: AuthSession;
  /** Set when the request was made with an API key instead of a session cookie. */
  apiKey?: ApiKeyAccess;
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
