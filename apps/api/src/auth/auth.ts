import { apiKey } from "@better-auth/api-key";
import type { PrismaClient } from "@seo-geo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { createAccessControl } from "better-auth/plugins/access";
import { organization } from "better-auth/plugins/organization";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import { twoFactor } from "better-auth/plugins/two-factor";
import { uuidv7 } from "uuidv7";

import type { AppConfig } from "../config/env.js";
import type { Mailer } from "../mail/mailer.js";
import {
  invitationEmail,
  resetPasswordEmail,
  resolveLocale,
  verifyEmail,
} from "../mail/templates.js";

/** Where Better Auth is mounted, on the api and (through the proxy) on the web origin. */
export const AUTH_BASE_PATH = "/api/auth";

const DAY = 24 * 60 * 60;

const ac = createAccessControl(defaultStatements);

/**
 * Workspace management permissions per role. Viewers cannot manage the workspace, just like
 * members; the difference (members may configure projects) is enforced by our own API.
 */
const ROLES = {
  owner: ac.newRole({ ...ownerAc.statements }),
  admin: ac.newRole({ ...adminAc.statements }),
  member: ac.newRole({ ...memberAc.statements }),
  viewer: ac.newRole({ ...memberAc.statements }),
};

export interface AuthDependencies {
  config: AppConfig;
  prisma: PrismaClient;
  mailer: Mailer;
}

export function createAuth({ config, prisma, mailer }: AuthDependencies) {
  return betterAuth({
    appName: "SEO-GEO",
    baseURL: config.webUrl,
    basePath: AUTH_BASE_PATH,
    secret: config.authSecret,
    trustedOrigins: [config.webUrl],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: () => uuidv7() },
      cookiePrefix: "seogeo",
      useSecureCookies: config.webUrl.startsWith("https://"),
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false },
      },
    },
    session: {
      expiresIn: 30 * DAY,
      updateAge: DAY,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    emailAndPassword: {
      enabled: true,
      // Without a mail server nobody could verify, so verification needs email delivery.
      requireEmailVerification: mailer.deliversEmail,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await mailer.send({ to: user.email, ...resetPasswordEmail(url, localeOf(user)) });
      },
    },
    emailVerification: {
      sendOnSignUp: mailer.deliversEmail,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({ to: user.email, ...verifyEmail(url, localeOf(user)) });
      },
    },
    plugins: [
      organization({
        ac,
        roles: ROLES,
        creatorRole: "owner",
        allowUserToCreateOrganization: true,
        invitationExpiresIn: 7 * DAY,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: mailer.deliversEmail,
        sendInvitationEmail: async ({ id, email, role, organization: workspace, inviter }) => {
          const content = invitationEmail(
            {
              url: `${config.webUrl}/invite/${id}`,
              workspace: workspace.name,
              inviter: inviter.user.name,
              role,
            },
            localeOf(inviter.user),
          );
          await mailer.send({ to: email, ...content });
        },
      }),
      twoFactor({ issuer: "SEO-GEO" }),
      apiKey({ enableSessionForAPIKeys: true, defaultPrefix: "sg_", requireName: true }),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" || config.deploymentMode !== "selfhost") return;
        const body: unknown = ctx.body;
        const email =
          typeof body === "object" && body !== null && "email" in body
            ? String(body.email).trim().toLowerCase()
            : "";
        if ((await getSignUpMode(prisma, config)) === "first-user") return;
        if (email && (await hasPendingInvitation(prisma, email))) return;
        throw new APIError("FORBIDDEN", {
          code: "SIGN_UP_INVITE_ONLY",
          message: "Sign-up on this server is by invitation only.",
        });
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

/** Who may create an account right now. */
export async function getSignUpMode(
  prisma: PrismaClient,
  config: Pick<AppConfig, "deploymentMode">,
): Promise<"first-user" | "invite-only" | "open"> {
  if (config.deploymentMode === "cloud") return "open";
  const existing = await prisma.user.findFirst({ select: { id: true } });
  return existing ? "invite-only" : "first-user";
}

async function hasPendingInvitation(prisma: PrismaClient, email: string): Promise<boolean> {
  const invitation = await prisma.invitation.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return invitation !== null;
}

function localeOf(user: object) {
  return resolveLocale((user as { locale?: unknown }).locale);
}
