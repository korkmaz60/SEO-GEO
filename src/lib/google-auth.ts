import "server-only";
import { google } from "googleapis";

export function getGoogleOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`
  );
}

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

/**
 * state = userId:projectId (multi-user güvenliği)
 */
export function getAuthUrl(userId: string, projectId: string) {
  const client = getGoogleOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: GOOGLE_SCOPES,
    prompt: "consent",
    state: `${userId}:${projectId}`,
  });
}

/**
 * Authenticated Google client döndür (token refresh dahil)
 */
export function getAuthenticatedClient(accessToken: string | null, refreshToken: string | null) {
  const client = getGoogleOAuthClient();
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  return client;
}
