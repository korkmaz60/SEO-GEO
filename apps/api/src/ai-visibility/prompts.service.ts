import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  MAX_PROMPTS_PER_PROJECT,
  MAX_PROMPT_LENGTH,
  MIN_PROMPT_LENGTH,
  type CreatePrompts,
  type CreatePromptsQuote,
  type CreatePromptsResult,
  type UpdatePrompt,
} from "@seo-geo/contracts";
import { roundUsd } from "@seo-geo/dataforseo";
import type { Project } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { CredentialsService } from "../credentials/credentials.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { UsageService } from "../usage/usage.service.js";
import { PERIODS_PER_MONTH } from "./ai-platforms.js";
import { AiRunsService } from "./ai-runs.service.js";
import { AiSettingsService } from "./ai-settings.service.js";
import { loadAiSettings } from "./ai-settings.js";

/** A prompt as stored: NFC, trimmed, whitespace runs as single spaces. */
export function normalizePrompt(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

/** The project's prompt library. */
@Injectable()
export class PromptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly credentials: CredentialsService,
    private readonly runs: AiRunsService,
    private readonly settings: AiSettingsService,
  ) {}

  /** What adding prompts would do and cost for one period; nothing is saved. */
  async preview(
    workspaceId: string,
    projectId: string,
    input: CreatePrompts,
  ): Promise<{ prompts: string[]; duplicates: number; invalid: number; costUsd: number }> {
    const project = await this.project(workspaceId, projectId);
    const { fresh, duplicates, invalid } = await this.prepare(project, input);
    const costUsd =
      fresh.length > 0 ? await this.settings.periodCost(workspaceId, projectId, fresh.length) : 0;
    return { prompts: fresh, duplicates, invalid, costUsd };
  }

  /** {@link preview} with the cost per period and per 30 days. */
  async quote(
    workspaceId: string,
    projectId: string,
    input: CreatePrompts,
  ): Promise<CreatePromptsQuote> {
    const [preview, settings] = await Promise.all([
      this.preview(workspaceId, projectId, input),
      loadAiSettings(this.prisma, projectId),
    ]);
    return {
      prompts: preview.prompts.length,
      duplicates: preview.duplicates,
      invalid: preview.invalid,
      frequency: settings.frequency,
      perPeriodUsd: preview.costUsd,
      perMonthUsd: roundUsd(preview.costUsd * PERIODS_PER_MONTH[settings.frequency]),
    };
  }

  /** Adds prompts; they are asked right away and then on the project's schedule. */
  async create(
    workspaceId: string,
    projectId: string,
    input: CreatePrompts,
    userId: string,
  ): Promise<CreatePromptsResult> {
    const project = await this.project(workspaceId, projectId);
    const { market, fresh, duplicates, invalid } = await this.prepare(project, input);
    const result = { added: 0, duplicates, invalid };
    if (fresh.length === 0) return result;

    const stored = await this.prisma.prompt.count({ where: { projectId } });
    if (stored + fresh.length > MAX_PROMPTS_PER_PROJECT) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: `A project can have up to ${MAX_PROMPTS_PER_PROJECT} prompts.`,
      });
    }
    await this.usage.assertCanSpend(
      workspaceId,
      await this.settings.periodCost(workspaceId, projectId, fresh.length),
    );

    const { count } = await this.prisma.prompt.createMany({
      data: fresh.map((text) => ({
        workspaceId,
        projectId,
        text,
        ...market,
        tags: [...new Set(input.tags)],
        createdBy: userId,
      })),
      skipDuplicates: true,
    });
    await this.runs.requestCheck(projectId);
    return { ...result, added: count };
  }

  /** Normalized new prompts in the market, with duplicates and invalid entries counted. */
  private async prepare(project: Project, input: CreatePrompts) {
    const market = {
      locationCode: input.locationCode ?? project.defaultLocationCode,
      languageCode: input.languageCode ?? project.defaultLanguageCode,
    };
    let invalid = 0;
    const unique = new Set<string>();
    for (const raw of input.prompts) {
      const text = normalizePrompt(raw);
      if (text === "") continue;
      if (text.length < MIN_PROMPT_LENGTH || text.length > MAX_PROMPT_LENGTH) invalid++;
      else unique.add(text);
    }
    const existing = await this.prisma.prompt.findMany({
      where: { projectId: project.id, text: { in: [...unique] }, ...market },
      select: { text: true },
    });
    const known = new Set(existing.map((row) => row.text));
    const fresh = [...unique].filter((text) => !known.has(text));
    return { market, fresh, duplicates: known.size, invalid };
  }

  async update(
    workspaceId: string,
    projectId: string,
    promptId: string,
    input: UpdatePrompt,
  ): Promise<void> {
    const { count } = await this.prisma.prompt.updateMany({
      where: { id: promptId, workspaceId, projectId },
      data: {
        ...(input.tags ? { tags: [...new Set(input.tags)] } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
    });
    // A prompt made active again is asked by the next hourly check.
    if (count === 0) throw ProblemException.notFound("Prompt not found.");
  }

  /** Deletes prompts with their answers. */
  async remove(workspaceId: string, projectId: string, ids: readonly string[]): Promise<number> {
    const { count } = await this.prisma.prompt.deleteMany({
      where: { id: { in: [...ids] }, workspaceId, projectId },
    });
    return count;
  }

  /** Asks the prompts that are due now instead of waiting for the hourly schedule. */
  async runNow(workspaceId: string, projectId: string): Promise<void> {
    const project = await this.project(workspaceId, projectId);
    if (!(await this.credentials.hasDataForSeo(workspaceId))) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.ProviderError,
        detail: "Connect a working DataForSEO account in the workspace settings first.",
      });
    }
    await this.runs.requestCheck(project.id);
  }

  private async project(workspaceId: string, projectId: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, workspaceId } });
    if (!project) throw ProblemException.notFound("Project not found.");
    return project;
  }
}
