import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  type AiCostQuote,
  type AiCostQuoteRequest,
  type AiModels,
  type AiSettings,
  type ModelPlatform,
  type UpdateAiSettings,
} from "@seo-geo/contracts";
import { estimateProviderAnswerCost, roundUsd } from "@seo-geo/dataforseo";
import type { Project } from "@seo-geo/db";

import { AuditService } from "../audit/audit.service.js";
import { ProblemException } from "../common/problem.exception.js";
import type { RequestMeta } from "../common/request-meta.js";
import { CredentialsService } from "../credentials/credentials.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { AiModelsService } from "./ai-models.service.js";
import {
  PERIODS_PER_MONTH,
  RESPONSES_PLATFORMS,
  SENTIMENT_COST_PER_MENTION,
  answerCost,
  modelOf,
  pickDefaultModel,
} from "./ai-platforms.js";
import { loadAiSettings } from "./ai-settings.js";

/** How a project's prompts are asked, what that costs, and the models on offer. */
@Injectable()
export class AiSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly models: AiModelsService,
    private readonly audit: AuditService,
  ) {}

  async get(workspaceId: string, projectId: string): Promise<AiSettings> {
    await this.project(workspaceId, projectId);
    return loadAiSettings(this.prisma, projectId);
  }

  async update(
    workspaceId: string,
    projectId: string,
    input: UpdateAiSettings,
    meta: RequestMeta,
  ): Promise<AiSettings> {
    await this.project(workspaceId, projectId);
    const current = await loadAiSettings(this.prisma, projectId);
    const next: AiSettings = {
      platforms: input.platforms ? [...new Set(input.platforms)] : current.platforms,
      frequency: input.frequency ?? current.frequency,
      samples: input.samples ?? current.samples,
      models: { ...current.models, ...input.models },
      sentiment: input.sentiment ?? current.sentiment,
    };
    const data = {
      platforms: next.platforms,
      frequency: next.frequency,
      samples: next.samples,
      models: Object.fromEntries(Object.entries(next.models).filter(([, model]) => model)),
      sentiment: next.sentiment,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.projectAiSettings.upsert({
        where: { projectId },
        create: { projectId, workspaceId, ...data },
        update: data,
      });
      await this.audit.record(
        {
          workspaceId,
          action: "project.ai_settings_updated",
          target: { type: "project", id: projectId },
          metadata: { ...data },
          meta,
        },
        tx,
      );
    });
    // Newly enabled platforms and samples are asked by the next hourly check (or "run now",
    // which needs the run:paid scope).
    return next;
  }

  /**
   * Upper-bound cost of the saved settings, or of the settings in `input`, with the active
   * prompts plus `additionalPrompts`.
   */
  async quote(
    workspaceId: string,
    projectId: string,
    input: AiCostQuoteRequest,
  ): Promise<AiCostQuote> {
    await this.project(workspaceId, projectId);
    const [saved, activePrompts] = await Promise.all([
      loadAiSettings(this.prisma, projectId),
      this.prisma.prompt.count({ where: { projectId, active: true } }),
    ]);
    const settings: AiSettings = {
      platforms: input.platforms ? [...new Set(input.platforms)] : saved.platforms,
      frequency: input.frequency ?? saved.frequency,
      samples: input.samples ?? saved.samples,
      models: { ...saved.models, ...input.models },
      sentiment: input.sentiment ?? saved.sentiment,
    };
    const prompts = activePrompts + (input.additionalPrompts ?? 0);
    return this.estimate(workspaceId, projectId, settings, prompts);
  }

  /** Upper-bound cost of asking `prompts` prompts for one period with the saved settings. */
  async periodCost(workspaceId: string, projectId: string, prompts: number): Promise<number> {
    const settings = await loadAiSettings(this.prisma, projectId);
    return (await this.estimate(workspaceId, projectId, settings, prompts)).perPeriodUsd;
  }

  private async estimate(
    workspaceId: string,
    projectId: string,
    settings: AiSettings,
    prompts: number,
  ): Promise<AiCostQuote> {
    const [brands, client] = await Promise.all([
      settings.sentiment ? this.prisma.brandEntity.count({ where: { projectId } }) : 0,
      this.credentials.findDataForSeoClient(workspaceId),
    ]);
    const defaults = await this.models.defaults(client);
    const answers = prompts * settings.samples;
    const platforms = settings.platforms.map((platform) => {
      const model = modelOf(settings, platform, defaults);
      return {
        platform,
        answers,
        costUsd: roundUsd(answers * answerCost(platform, model)),
        model,
      };
    });
    const answersPerPeriod = answers * settings.platforms.length;
    const sentimentUsd = roundUsd(answersPerPeriod * brands * SENTIMENT_COST_PER_MENTION);
    const perPeriodUsd = roundUsd(
      platforms.reduce((sum, entry) => sum + entry.costUsd, 0) + sentimentUsd,
    );
    return {
      prompts,
      answersPerPeriod,
      perPeriodUsd,
      perMonthUsd: roundUsd(perPeriodUsd * PERIODS_PER_MONTH[settings.frequency]),
      platforms,
      sentimentUsd,
    };
  }

  /** Models a model-API platform offers that can answer with web search. */
  async listModels(
    workspaceId: string,
    projectId: string,
    platform: ModelPlatform,
  ): Promise<AiModels> {
    await this.project(workspaceId, projectId);
    const client = await this.credentials.findDataForSeoClient(workspaceId);
    if (!client) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.ProviderError,
        detail: "Connect a working DataForSEO account in the workspace settings first.",
      });
    }
    const models = await this.models.list(client, RESPONSES_PLATFORMS[platform]);
    if (!models) {
      throw new ProblemException({
        status: HttpStatus.BAD_GATEWAY,
        code: ErrorCode.ProviderError,
        detail: "DataForSEO did not list the models. Try again later.",
      });
    }
    const usable = models.filter((model) => platform === "PERPLEXITY" || model.webSearch);
    const fallback = pickDefaultModel(platform, models);
    return {
      platform,
      models: usable
        .map((model) => ({
          name: model.name,
          estimatedCostUsd: answerCost(platform, model.name),
          isDefault: model.name === fallback,
        }))
        .sort(
          (a, b) =>
            a.estimatedCostUsd - b.estimatedCostUsd ||
            estimateProviderAnswerCost(a.name) - estimateProviderAnswerCost(b.name) ||
            a.name.localeCompare(b.name),
        ),
    };
  }

  private async project(workspaceId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }
}
