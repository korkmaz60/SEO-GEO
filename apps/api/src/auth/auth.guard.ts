import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ErrorCode } from "@seo-geo/contracts";
import { isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";

import { ProblemException } from "../common/problem.exception.js";
import { AUTH } from "./auth.tokens.js";
import type { Auth } from "./auth.js";
import { IS_PUBLIC } from "./metadata.js";
import type { AuthenticatedRequest } from "./principal.js";

/**
 * Global guard: every route needs a session cookie or an API key unless marked `@Public()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const result = await this.session(request);
    if (!result) {
      throw new ProblemException({
        status: HttpStatus.UNAUTHORIZED,
        code: ErrorCode.Unauthorized,
        detail: "Sign in to continue.",
      });
    }
    request.principal = { user: result.user, session: result.session };
    return true;
  }

  /** The session from the cookie or API key; `null` for missing, expired or revoked ones. */
  private async session(request: AuthenticatedRequest) {
    try {
      return await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    } catch (error) {
      // Better Auth throws for a bad API key (unknown, expired, disabled) instead of
      // returning no session; that is an authentication failure, not a server error.
      if (isAPIError(error) && error.statusCode >= 400 && error.statusCode < 500) return null;
      throw error;
    }
  }
}
