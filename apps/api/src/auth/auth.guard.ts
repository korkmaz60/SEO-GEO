import {
  HttpStatus,
  Inject,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ApiScopeSchema, ErrorCode, type ApiScope } from "@seo-geo/contracts";
import { isAPIError } from "better-auth/api";
import { fromNodeHeaders } from "better-auth/node";

import { ProblemException } from "../common/problem.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { apiKeyOf } from "./api-key-header.js";
import { AUTH } from "./auth.tokens.js";
import type { Auth } from "./auth.js";
import { IS_PUBLIC, REQUIRED_SCOPE, SESSION_ONLY } from "./metadata.js";
import type { ApiKeyAccess, AuthenticatedRequest } from "./principal.js";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global guard: every route needs a session cookie or an API key unless marked `@Public()`.
 * Requests with a workspace API key must also fit the key's scopes (see `RequireScope`).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
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
    // With an API key, the plugin's session carries the key's ID.
    const apiKey = apiKeyOf((name) => request.headers[name])
      ? await this.apiKeyAccess(result.session.id)
      : undefined;
    request.principal = { user: result.user, session: result.session, apiKey };

    const targets = [context.getHandler(), context.getClass()];
    if (apiKey && this.reflector.getAllAndOverride<boolean | undefined>(SESSION_ONLY, targets)) {
      throw new ProblemException({
        status: HttpStatus.FORBIDDEN,
        code: ErrorCode.Forbidden,
        detail: "API keys cannot do this. Sign in instead.",
      });
    }
    if (apiKey?.scopes) {
      const required =
        this.reflector.getAllAndOverride<ApiScope | undefined>(REQUIRED_SCOPE, targets) ??
        (READ_METHODS.has(request.method) ? "read" : "write");
      if (!apiKey.scopes.includes(required)) {
        throw new ProblemException({
          status: HttpStatus.FORBIDDEN,
          code: ErrorCode.Forbidden,
          detail: `This API key does not have the ${required} scope.`,
        });
      }
    }
    return true;
  }

  private async apiKeyAccess(keyId: string): Promise<ApiKeyAccess> {
    const bound = await this.prisma.workspaceApiKey.findUnique({ where: { keyId } });
    if (!bound) return { id: keyId, workspaceId: null, scopes: null };
    return {
      id: keyId,
      workspaceId: bound.workspaceId,
      scopes: bound.scopes.flatMap((scope) => {
        const parsed = ApiScopeSchema.safeParse(scope);
        return parsed.success ? [parsed.data] : [];
      }),
    };
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
