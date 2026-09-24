/** Better Auth error codes that have their own message under `errors.auth`. */
export const AUTH_ERROR_CODES = [
  "INVALID_EMAIL_OR_PASSWORD",
  "EMAIL_NOT_VERIFIED",
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "INVALID_PASSWORD",
  "SIGN_UP_INVITE_ONLY",
  "INVALID_TOKEN",
  "INVALID_CODE",
  "INVALID_BACKUP_CODE",
  "INVALID_SLUG",
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
  "INVITATION_NOT_FOUND",
  "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION",
  "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION",
  "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
  "YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE",
  "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER",
  "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER",
  "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER",
  "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
  "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED",
  "INVITATION_LIMIT_REACHED",
  "EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION",
  "SESSION_EXPIRED",
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export interface AuthClientError {
  code?: string;
  message?: string;
  status?: number;
}

/**
 * Resolves the message key for an auth client error: a known code, rate limiting, or the
 * generic fallback.
 */
export function authErrorKey(
  error: AuthClientError | null | undefined,
): `auth.${AuthErrorCode}` | "tooManyRequests" | "generic" {
  if (error?.status === 429) return "tooManyRequests";
  const code = error?.code as AuthErrorCode | undefined;
  return code && (AUTH_ERROR_CODES as readonly string[]).includes(code)
    ? `auth.${code}`
    : "generic";
}
