"use client";

import { apiKeyClient } from "@better-auth/api-key/client";
import { createAuthClient } from "better-auth/react";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";
import {
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";

// Mirrors the roles configured on the api (apps/api/src/auth/auth.ts).
const ac = createAccessControl(defaultStatements);
const roles = {
  owner: ac.newRole({ ...ownerAc.statements }),
  admin: ac.newRole({ ...adminAc.statements }),
  member: ac.newRole({ ...memberAc.statements }),
  viewer: ac.newRole({ ...memberAc.statements }),
};

/** Better Auth on the same origin (`/api/auth`, forwarded to the api). */
export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({ user: { locale: { type: "string", required: false } } }),
    organizationClient({ ac, roles }),
    twoFactorClient({
      onTwoFactorRedirect() {
        // Called by the auth client outside React, where no router is available.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `/two-factor${window.location.search}`;
      },
    }),
    apiKeyClient(),
  ],
});
