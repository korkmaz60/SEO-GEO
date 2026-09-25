import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  InstanceInfoSchema,
  LocaleSchema,
  MeResponseSchema,
  WorkspaceRoleSchema,
  type InstanceInfo,
  type MeResponse,
} from "@seo-geo/contracts";

import { getSignUpMode } from "../../auth/auth.js";
import { CurrentPrincipal, Public } from "../../auth/decorators.js";
import type { Principal } from "../../auth/principal.js";
import { toOpenApiSchema } from "../../common/openapi.js";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { PrismaService } from "../../database/prisma.service.js";
import { MAILER, type Mailer } from "../../mail/mailer.js";

@ApiTags("account")
@Controller()
export class AccountController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get("instance")
  @ApiOperation({ summary: "What this installation offers before signing in" })
  @ApiOkResponse({ schema: toOpenApiSchema(InstanceInfoSchema) })
  async instance(): Promise<InstanceInfo> {
    return {
      version: this.config.version,
      deploymentMode: this.config.deploymentMode,
      signUp: await getSignUpMode(this.prisma, this.config),
      emailDelivery: this.mailer.deliversEmail,
    };
  }

  @Get("me")
  @ApiOperation({ summary: "The signed-in user and their workspaces" })
  @ApiOkResponse({ schema: toOpenApiSchema(MeResponseSchema) })
  async me(@CurrentPrincipal() { user, apiKey }: Principal): Promise<MeResponse> {
    const memberships = await this.prisma.member.findMany({
      // A workspace API key sees only its workspace.
      where: {
        userId: user.id,
        ...(apiKey?.workspaceId ? { organizationId: apiKey.workspaceId } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        role: true,
        organization: { select: { id: true, name: true, slug: true, logo: true } },
      },
    });
    const locale = LocaleSchema.safeParse((user as { locale?: unknown }).locale);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image ?? null,
        locale: locale.success ? locale.data : null,
        twoFactorEnabled: Boolean((user as { twoFactorEnabled?: unknown }).twoFactorEnabled),
      },
      workspaces: memberships.flatMap(({ role, organization }) => {
        const parsed = WorkspaceRoleSchema.safeParse(role);
        return parsed.success ? [{ ...organization, role: parsed.data }] : [];
      }),
    };
  }
}
