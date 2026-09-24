"use client";

import {
  KeywordListDetailSchema,
  KeywordListSchema,
  type Locale,
  type Project,
} from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Trash2, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { AddKeywordsDialog } from "@/components/rank-tracker/add-keywords-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiSend } from "@/lib/api";
import { formatCompact, formatDate, formatNumber } from "@/lib/format";
import { findMarket } from "@/lib/locations";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { Difficulty, IntentBadge } from "./keyword-metrics";
import { keywordListsKey } from "./save-to-list-dialog";

/** Saved keyword lists of the workspace. */
export function KeywordLists() {
  const t = useTranslations("keywordExplorer.lists");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const [open, setOpen] = useState<string | null>(null);
  const lists = useQuery({
    queryKey: keywordListsKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/keyword-lists`,
        z.object({ data: z.array(KeywordListSchema) }),
        { signal },
      ),
  });

  if (!lists.data) return <Skeleton className="h-40 w-full" />;
  if (lists.data.data.length === 0) {
    return <EmptyState icon={ListChecks} title={t("emptyTitle")} description={t("emptyBody")} />;
  }
  return (
    <>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead className="text-right">{t("keywords")}</TableHead>
              <TableHead className="text-right">{t("updated")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lists.data.data.map((list) => (
              <TableRow key={list.id} className="cursor-pointer" onClick={() => setOpen(list.id)}>
                <TableCell className="font-medium">{list.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(list.itemCount, locale)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatDate(list.updatedAt, locale)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ListSheet listId={open} onClose={() => setOpen(null)} />
    </>
  );
}

function ListSheet({ listId, onClose }: { listId: string | null; onClose: () => void }) {
  const t = useTranslations("keywordExplorer.lists");
  const te = useTranslations("keywordExplorer");
  const locale = useLocale() as Locale;
  const { workspace, projects } = useWorkspace();
  const canEdit = useCan("member");
  const queryClient = useQueryClient();
  const [trackIn, setTrackIn] = useState<Project | null>(null);
  const detail = useQuery({
    queryKey: [...keywordListsKey(workspace.id), listId],
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/keyword-lists/${listId}`, KeywordListDetailSchema, {
        signal,
      }),
    enabled: listId !== null,
  });
  const list = detail.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: keywordListsKey(workspace.id) });
  // Tracking needs one market; lists mixing markets are tracked per the first item's market.
  const market = list?.items[0]
    ? { locationCode: list.items[0].locationCode, languageCode: list.items[0].languageCode }
    : undefined;

  return (
    <Sheet open={listId !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-8 text-lg">{list?.name ?? " "}</SheetTitle>
          <SheetDescription>{list ? t("count", { count: list.itemCount }) : " "}</SheetDescription>
        </SheetHeader>
        {!list ? (
          <Skeleton className="m-4 h-64" />
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {canEdit && (
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={projects.length === 0 || list.items.length === 0}
                      />
                    }
                  >
                    <TrendingUp />
                    {te("track")}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>{te("trackIn")}</DropdownMenuLabel>
                      {projects.map((candidate) => (
                        <DropdownMenuItem key={candidate.id} onClick={() => setTrackIn(candidate)}>
                          {candidate.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="outline">
                      <Trash2 />
                      {t("delete")}
                    </Button>
                  }
                  title={t("deleteTitle", { name: list.name })}
                  description={t("deleteDescription")}
                  confirmLabel={t("delete")}
                  onConfirm={async () => {
                    await apiSend("DELETE", `/workspaces/${workspace.id}/keyword-lists/${list.id}`);
                    toast.success(t("deleted"));
                    onClose();
                    await refresh();
                  }}
                />
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{te("columns.keyword")}</TableHead>
                    <TableHead>{t("market")}</TableHead>
                    <TableHead className="text-right">{te("columns.volume")}</TableHead>
                    <TableHead>{te("columns.difficulty")}</TableHead>
                    <TableHead>{te("columns.intent")}</TableHead>
                    {canEdit && <TableHead className="w-8" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.items.map((item) => {
                    const itemMarket = findMarket(item.locationCode);
                    return (
                      <TableRow key={`${item.keyword}-${item.locationCode}-${item.languageCode}`}>
                        <TableCell className="font-medium">{item.keyword}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {itemMarket ? itemMarket.names[locale] : item.locationCode} ·{" "}
                          {item.languageCode}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.metrics?.searchVolume != null
                            ? formatCompact(item.metrics.searchVolume, locale)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Difficulty value={item.metrics?.keywordDifficulty ?? null} />
                        </TableCell>
                        <TableCell>
                          <IntentBadge intent={item.metrics?.intent ?? null} />
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("remove", { keyword: item.keyword })}
                              onClick={async () => {
                                await apiSend(
                                  "POST",
                                  `/workspaces/${workspace.id}/keyword-lists/${list.id}/items/delete`,
                                  {
                                    items: [
                                      {
                                        keyword: item.keyword,
                                        locationCode: item.locationCode,
                                        languageCode: item.languageCode,
                                      },
                                    ],
                                  },
                                );
                                await refresh();
                              }}
                            >
                              <Trash2 />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        {trackIn && list && (
          <AddKeywordsDialog
            key={trackIn.id}
            project={trackIn}
            open
            onOpenChange={(next) => !next && setTrackIn(null)}
            initialKeywords={list.items.map((item) => item.keyword)}
            market={market}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
