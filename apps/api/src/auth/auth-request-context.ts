import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Who is calling a Better Auth endpoint. Better Auth's organization hooks describe the
 * affected member, not the actor, so the auth handler runs inside this context and a
 * `before` hook fills in the actor for the audit log.
 */
export interface AuthRequestContext {
  ip: string | null;
  userAgent: string | null;
  actorId: string | null;
}

export const authRequestContext = new AsyncLocalStorage<AuthRequestContext>();
