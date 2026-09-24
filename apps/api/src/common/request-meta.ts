import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthenticatedRequest } from "../auth/principal.js";

/** Who did something, for the audit log. */
export interface RequestMeta {
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
}

export const Meta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestMeta => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userAgent = request.headers["user-agent"];
    return {
      userId: request.principal?.user.id ?? null,
      ip: request.ip ?? null,
      userAgent: typeof userAgent === "string" ? userAgent.slice(0, 512) : null,
    };
  },
);
