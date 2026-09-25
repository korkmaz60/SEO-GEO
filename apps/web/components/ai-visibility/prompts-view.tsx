"use client";

import {
  AiPromptListSchema,
  type AiPromptRow,
  type Locale,
  type Project,
} from "@seo-geo/contracts";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Quote,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { formatDay, formatNumber, formatPercent } from "@/lib/format";
import { findMarket } from "@/lib/locations";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { AddPromptsDialog } from "./add-prompts-dialog";
import { PendingNotice, ProviderMissing, RangeToggle, useAiActions } from "./ai-summary-view";
import { PLATFORM_CODES, PLATFORM_NAMES } from "./platforms";
import { PromptSheet } from "./prompt-sheet";
import { aiBase, useAiSummary, type AiDays } from "./queries";

const PAGE_SIZE = 50;
const ALL_TAGS = "__all__";

export function PromptsView() {
  const t = useTranslations("aiVisibility.prompts");
  const ta = useTranslations("aiVisibility");
  const tp = useTranslations("pages.prompts");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canEdit = useCan("member");
  const queryClient = useQueryClient();
  const [days, setDays] = useState<AiDays>(30);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState(ALL_TAGS);
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AiPromptRow | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const summary = useAiSummary(project?.id ?? null, days);
  const run = useAiActions(project?.id ?? null);
  const base = project ? aiBase(workspace.id, project.id) : "";

  const params = new URLSearchParams({
    days: String(days),
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (tag !== ALL_TAGS) params.set("tag", tag);
  const list = useQuery({
    queryKey: ["ai-visibility", project?.id, "prompts", params.toString()],
    queryFn: ({ signal }) => apiGet(`${base}/prompts?${params}`, AiPromptListSchema, { signal }),
    enabled: project !== null,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.data?.data.some((row) => row.pending) ? 20_000 : false,
  });

  if (!project) return null;
  const data = list.data;
  const settings = summary.data;
  const filtered = debouncedSearch !== "" || tag !== ALL_TAGS;

  async function setActive(row: AiPromptRow, active: boolean) {
    try {
      await apiSend("PATCH", `${base}/prompts/${row.id}`, { active });
      toast.success(active ? t("resumed") : t("paused"));
      await queryClient.invalidateQueries({ queryKey: ["ai-visibility", project?.id] });
    } catch (error) {
      toast.error(errorMessage(error, ta("actionFailed")));
    }
  }

  const tagItems = [
    { value: ALL_TAGS, label: t("allTags") },
    ...(data?.tags ?? []).map((value) => ({ value, label: value })),
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={tp("title")}
        description={tp("description")}
        actions={
          canEdit && (
            <>
              {(data?.total ?? 0) > 0 && settings && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!settings.providerReady || run.isPending}
                  onClick={() => run.mutate()}
                >
                  <RefreshCw />
                  {ta("runNow")}
                </Button>
              )}
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus />
                {ta("addPrompts")}
              </Button>
            </>
          )
        }
      />
      {settings && !settings.providerReady && <ProviderMissing />}
      {settings && <PendingNotice count={settings.pendingRuns} />}

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.total === 0 && !filtered ? (
        <EmptyState icon={MessageSquareText} title={tp("emptyTitle")} description={tp("emptyBody")}>
          {canEdit && (
            <Button onClick={() => setAdding(true)}>
              <Plus />
              {ta("addPrompts")}
            </Button>
          )}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-full sm:w-72">
              <InputGroupAddon>
                <Search aria-hidden />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setOffset(0);
                }}
                placeholder={t("search")}
                aria-label={t("search")}
              />
            </InputGroup>
            {data.tags.length > 0 && (
              <Select
                items={tagItems}
                value={tag}
                onValueChange={(value) => {
                  if (value) {
                    setTag(value);
                    setOffset(0);
                  }
                }}
              >
                <SelectTrigger size="sm" aria-label={t("tag")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tagItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="text-sm text-muted-foreground">
              {t("count", { count: data.total })}
            </span>
            <div className="sm:ml-auto">
              <RangeToggle days={days} onChange={setDays} />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-80">{t("prompt")}</TableHead>
                  <TableHead className="text-right">{t("mentioned")}</TableHead>
                  <TableHead className="text-right">{t("cited")}</TableHead>
                  <TableHead>{t("latest")}</TableHead>
                  <TableHead>{t("lastRun")}</TableHead>
                  {canEdit && <TableHead className="w-20" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {t("noMatches")}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.data.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => setOpen(row.id)}
                    >
                      <TableCell className="max-w-xl whitespace-normal">
                        <button
                          type="button"
                          className="line-clamp-2 text-left font-medium hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpen(row.id);
                          }}
                        >
                          {row.text}
                        </button>
                        <PromptMeta row={row} project={project} locale={locale} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <RateCell rate={row.mentionRate} runs={row.runs} locale={locale} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <RateCell rate={row.citationRate} runs={row.runs} locale={locale} />
                      </TableCell>
                      <TableCell>
                        <LatestAnswers row={row} locale={locale} />
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                        {row.pending ? (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="size-3.5" aria-hidden />
                            {t("collecting")}
                          </span>
                        ) : row.lastRunOn ? (
                          formatDay(row.lastRunOn, locale)
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      {canEdit && (
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          <span className="flex justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={row.active ? t("pause") : t("resume")}
                              title={row.active ? t("pause") : t("resume")}
                              onClick={() => setActive(row, !row.active)}
                            >
                              {row.active ? <Pause /> : <Play />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("delete")}
                              title={t("delete")}
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 />
                            </Button>
                          </span>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {data.total > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 text-sm">
              <span className="text-muted-foreground tabular-nums">
                {t("pageRange", {
                  from: formatNumber(offset + 1, locale),
                  to: formatNumber(Math.min(offset + PAGE_SIZE, data.total), locale),
                  total: formatNumber(data.total, locale),
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + PAGE_SIZE >= data.total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t("next")}
              </Button>
            </div>
          )}
        </div>
      )}

      <AddPromptsDialog project={project} open={adding} onOpenChange={setAdding} />
      <PromptSheet project={project} promptId={open} days={days} onClose={() => setOpen(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription", { prompt: deleting?.text ?? "" })}
        confirmLabel={t("delete")}
        destructive
        onConfirm={async () => {
          await apiSend("POST", `${base}/prompts/delete`, { ids: deleting ? [deleting.id] : [] });
          toast.success(t("deleted"));
          setDeleting(null);
          await queryClient.invalidateQueries({ queryKey: ["ai-visibility", project.id] });
        }}
      />
    </div>
  );
}

function PromptMeta({
  row,
  project,
  locale,
}: {
  row: AiPromptRow;
  project: Project;
  locale: Locale;
}) {
  const t = useTranslations("aiVisibility.prompts");
  const market =
    row.locationCode !== project.locationCode || row.languageCode !== project.languageCode
      ? (findMarket(row.locationCode)?.names[locale] ?? String(row.locationCode))
      : null;
  if (!market && row.tags.length === 0 && row.active) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      {!row.active && <Badge variant="outline">{t("pausedBadge")}</Badge>}
      {market && (
        <Badge variant="secondary">
          {market} · {row.languageCode}
        </Badge>
      )}
      {row.tags.map((tag) => (
        <Badge key={tag} variant="outline" className="font-normal">
          {tag}
        </Badge>
      ))}
    </span>
  );
}

function RateCell({ rate, runs, locale }: { rate: number | null; runs: number; locale: Locale }) {
  if (rate === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col items-end">
      <span className="font-medium">{formatPercent(rate, locale, 0)}</span>
      <span className="text-xs text-muted-foreground">
        {formatNumber(Math.round(rate * runs), locale)}/{formatNumber(runs, locale)}
      </span>
    </span>
  );
}

/**
 * The latest answer of each platform as a compact chip: the own brand's rank when mentioned
 * (a dash when not), and a quote mark when the own site was cited.
 */
function LatestAnswers({ row, locale }: { row: AiPromptRow; locale: Locale }) {
  const t = useTranslations("aiVisibility.prompts");
  if (row.latest.length === 0) {
    return <span className="text-sm text-muted-foreground">{t("noAnswers")}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {row.latest.map((answer) => {
        const summary = [
          `${PLATFORM_NAMES[answer.platform]} · ${formatDay(answer.runOn, locale)}`,
          answer.mentioned ? t("mentionedAt", { rank: answer.rank ?? 0 }) : t("notMentioned"),
          ...(answer.cited ? [t("citedSite")] : []),
          ...(answer.competitors > 0
            ? [t("competitorsMentioned", { count: answer.competitors })]
            : []),
        ].join(" · ");
        return (
          <Tooltip key={answer.platform}>
            <TooltipTrigger
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium tabular-nums",
                answer.mentioned
                  ? "border-chart-1/40 bg-chart-1/10 text-foreground"
                  : "text-muted-foreground",
              )}
              aria-label={summary}
            >
              <span className="text-muted-foreground">{PLATFORM_CODES[answer.platform]}</span>
              <span>{answer.mentioned ? `#${answer.rank}` : "–"}</span>
              {answer.cited && <Quote className="size-3" aria-hidden />}
            </TooltipTrigger>
            <TooltipContent>{summary}</TooltipContent>
          </Tooltip>
        );
      })}
    </span>
  );
}
