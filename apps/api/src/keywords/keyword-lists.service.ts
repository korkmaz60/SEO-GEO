import { HttpStatus, Injectable } from "@nestjs/common";
import {
  ErrorCode,
  MAX_KEYWORD_LIST_ITEMS,
  type CreateKeywordList,
  type KeywordList,
  type KeywordListDetail,
  type KeywordListItemInput,
} from "@seo-geo/contracts";
import { keywordProblem, normalizeKeyword } from "@seo-geo/core";
import type { KeywordList as KeywordListRow, Prisma } from "@seo-geo/db";

import { ProblemException } from "../common/problem.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { KeywordMetricsService, metricKey, toKeywordMetrics } from "./keyword-metrics.service.js";

function toList(row: KeywordListRow & { _count: { items: number } }): KeywordList {
  return {
    id: row.id,
    name: row.name,
    itemCount: row._count.items,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Normalized, valid and unique items. */
function cleanItems(items: readonly KeywordListItemInput[]): KeywordListItemInput[] {
  const unique = new Map<string, KeywordListItemInput>();
  for (const item of items) {
    const keyword = normalizeKeyword(item.keyword, item.languageCode);
    if (keywordProblem(keyword)) continue;
    const clean = { ...item, keyword };
    unique.set(metricKey(keyword, clean), clean);
  }
  return [...unique.values()];
}

/** Saved keyword research, per workspace. */
@Injectable()
export class KeywordListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: KeywordMetricsService,
  ) {}

  async list(workspaceId: string): Promise<KeywordList[]> {
    const rows = await this.prisma.keywordList.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { items: true } } },
    });
    return rows.map(toList);
  }

  async create(
    workspaceId: string,
    input: CreateKeywordList,
    userId: string,
  ): Promise<KeywordList> {
    const items = cleanItems(input.items);
    const row = await this.prisma.keywordList.create({
      data: {
        workspaceId,
        name: input.name,
        createdBy: userId,
        items: { createMany: { data: items, skipDuplicates: true } },
      },
      include: { _count: { select: { items: true } } },
    });
    return toList(row);
  }

  async detail(workspaceId: string, listId: string): Promise<KeywordListDetail> {
    const row = await this.prisma.keywordList.findFirst({
      where: { id: listId, workspaceId },
      include: {
        items: { orderBy: { addedAt: "asc" } },
        _count: { select: { items: true } },
      },
    });
    if (!row) throw ProblemException.notFound("Keyword list not found.");
    const stored = await this.metrics.lookup(row.items);
    return {
      ...toList(row),
      items: row.items.map((item) => {
        const metrics = stored.get(metricKey(item.keyword, item));
        return {
          keyword: item.keyword,
          locationCode: item.locationCode,
          languageCode: item.languageCode,
          addedAt: item.addedAt.toISOString(),
          metrics: metrics ? toKeywordMetrics(metrics) : null,
        };
      }),
    };
  }

  async rename(workspaceId: string, listId: string, name: string): Promise<KeywordList> {
    await this.find(workspaceId, listId);
    const row = await this.prisma.keywordList.update({
      where: { id: listId },
      data: { name },
      include: { _count: { select: { items: true } } },
    });
    return toList(row);
  }

  async delete(workspaceId: string, listId: string): Promise<void> {
    const { count } = await this.prisma.keywordList.deleteMany({
      where: { id: listId, workspaceId },
    });
    if (count === 0) throw ProblemException.notFound("Keyword list not found.");
  }

  async addItems(
    workspaceId: string,
    listId: string,
    items: readonly KeywordListItemInput[],
  ): Promise<KeywordList> {
    await this.find(workspaceId, listId);
    const clean = cleanItems(items);
    const count = await this.prisma.keywordListItem.count({ where: { listId } });
    if (count + clean.length > MAX_KEYWORD_LIST_ITEMS) {
      throw new ProblemException({
        status: HttpStatus.CONFLICT,
        code: ErrorCode.Conflict,
        detail: `A list can hold up to ${MAX_KEYWORD_LIST_ITEMS} keywords.`,
      });
    }
    await this.prisma.$transaction([
      this.prisma.keywordListItem.createMany({
        data: clean.map((item) => ({ listId, ...item })),
        skipDuplicates: true,
      }),
      this.touch(listId),
    ]);
    return this.summary(listId);
  }

  async removeItems(
    workspaceId: string,
    listId: string,
    items: readonly KeywordListItemInput[],
  ): Promise<KeywordList> {
    await this.find(workspaceId, listId);
    const clean = cleanItems(items);
    await this.prisma.$transaction([
      this.prisma.keywordListItem.deleteMany({
        where: {
          listId,
          OR: clean.map((item) => ({
            keyword: item.keyword,
            locationCode: item.locationCode,
            languageCode: item.languageCode,
          })),
        },
      }),
      this.touch(listId),
    ]);
    return this.summary(listId);
  }

  private touch(listId: string): Prisma.PrismaPromise<unknown> {
    return this.prisma.keywordList.update({
      where: { id: listId },
      data: { updatedAt: new Date() },
    });
  }

  private async summary(listId: string): Promise<KeywordList> {
    const row = await this.prisma.keywordList.findUniqueOrThrow({
      where: { id: listId },
      include: { _count: { select: { items: true } } },
    });
    return toList(row);
  }

  private async find(workspaceId: string, listId: string): Promise<KeywordListRow> {
    const row = await this.prisma.keywordList.findFirst({ where: { id: listId, workspaceId } });
    if (!row) throw ProblemException.notFound("Keyword list not found.");
    return row;
  }
}
