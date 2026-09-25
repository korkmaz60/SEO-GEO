import {
  SetMetadata,
  UseGuards,
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
} from "@nestjs/common";
import type { ApiScope, WorkspaceRole } from "@seo-geo/contracts";

import { IS_PUBLIC, REQUIRED_ROLE, REQUIRED_SCOPE, SESSION_ONLY } from "./metadata.js";
import type { AuthenticatedRequest, Principal, WorkspaceContext } from "./principal.js";
import { WorkspaceGuard } from "./workspace.guard.js";

/** Skips authentication for a route or controller. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/**
 * For controllers whose routes contain `:workspaceId`: requires membership of that workspace
 * (non-members get 404) and at least `role` (default `viewer`) for every route.
 * Use {@link RequireRole} on a route to raise the minimum.
 */
export const WorkspaceScoped = () => applyDecorators(UseGuards(WorkspaceGuard));

/** Minimum workspace role for a route: owner > admin > member > viewer. */
export const RequireRole = (role: WorkspaceRole) => SetMetadata(REQUIRED_ROLE, role);

/**
 * The API key scope a route needs. Without it, reads (`GET`) need `read` and everything else
 * `write`; routes that start paid provider work need `run:paid`, and read-only `POST`s
 * (quotes) `read`. Session cookies are not limited by scopes.
 */
export const RequireScope = (scope: ApiScope) => SetMetadata(REQUIRED_SCOPE, scope);

/**
 * Only for signed-in users, never API keys: provider credentials, budgets, Google
 * connections and API keys themselves.
 */
export const SessionOnly = () => SetMetadata(SESSION_ONLY, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) throw new Error("CurrentPrincipal used on a public route");
    return request.principal;
  },
);

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.workspace) throw new Error("CurrentWorkspace used without @WorkspaceScoped()");
    return request.workspace;
  },
);
