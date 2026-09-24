"use client";

import {
  KeywordResearchQuoteSchema,
  KeywordResearchResultSchema,
  type KeywordResearchResult,
  type Locale,
  type Project,
  type ResearchKeyword,
  type ResearchMode,
  type SearchIntent,
} from "@seo-geo/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ArrowUpDown, ListPlus, Search, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, type FormEvent } from "react";

import { Sparkline } from "@/components/charts/sparkline";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/page-header";
import { AddKeywordsDialog } from "@/components/rank-tracker/add-keywords-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiSend, errorMessage } from "@/lib/api";
import {
  formatCompact,
  formatDateTime,
  formatNumber,
  formatSignedPercent,
  formatUsd,
} from "@/lib/format";
import { MARKETS } from "@/lib/locations";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

import { Difficulty, IntentBadge } from "./keyword-metrics";
import { KeywordLists } from "./keyword-lists";
import { SaveToListDialog } from "./save-to-list-dialog";

const MODES = ["ideas", "suggestions", "related"] as const;
const LIMITS = ["50", "100", "200", "500"] as const;
type SortKey = "keyword" | "volume" | "difficulty" | "cpc" | "trend";

export function KeywordExplorer() {
  const t = useTranslations("keywordExplorer");
  const tp = useTranslations("pages.keywordExplorer");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const project = useCurrentProject();
  const canRun = useCan("member");
  const [keyword, setKeyword] = useState("");
  const [locationCode, setLocationCode] = useState(
    String(project?.locationCode ?? MARKETS[0]?.locationCode),
  );
  const [mode, setMode] = useState<ResearchMode>("suggestions");
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>("100");
  const market = MARKETS.find((entry) => String(entry.locationCode) === locationCode) ?? MARKETS[0];
  const request = market
    ? {
        mode,
        keyword: keyword.trim(),
        locationCode: market.locationCode,
        languageCode: market.languageCode,
        limit: Number(limit),
      }
    : null;

  const quoteKey = useDebouncedValue(JSON.stringify(request), 400);
  const debounced = JSON.parse(quoteKey) as typeof request;
  const quote = useQuery({
    queryKey: ["keyword-research-quote", workspace.id, quoteKey],
    queryFn: () =>
      apiSend(
        "POST",
        `/workspaces/${workspace.id}/research/keywords/quote`,
        debounced,
        KeywordResearchQuoteSchema,
      ),
    enabled: canRun && Boolean(debounced?.keyword),
    staleTime: 30_000,
  });
  const research = useMutation({
    mutationFn: (body: NonNullable<typeof request>) =>
      apiSend(
        "POST",
        `/workspaces/${workspace.id}/research/keywords`,
        body,
        KeywordResearchResultSchema,
      ),
    onSuccess: () => void quote.refetch(),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request?.keyword) research.mutate(request);
  }

  const marketItems = MARKETS.map((entry) => ({
    value: String(entry.locationCode),
    label: `${entry.names[locale]} · ${entry.languageCode}`,
  }));
  const limitItems = LIMITS.map((value) => ({
    value,
    label: t("limit", { count: Number(value) }),
  }));

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader title={tp("title")} description={tp("description")} />
      <Tabs defaultValue="research">
        <TabsList>
          <TabsTrigger value="research">{t("tabs.research")}</TabsTrigger>
          <TabsTrigger value="lists">{t("tabs.lists")}</TabsTrigger>
        </TabsList>
        <TabsContent value="research" className="mt-4 flex flex-col gap-6">
          <Card>
            <CardContent>
              <form onSubmit={submit} className="flex flex-col gap-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_16rem_10rem_auto]">
                  <Field>
                    <FieldLabel htmlFor="seed" className="sr-only">
                      {t("seed")}
                    </FieldLabel>
                    <Input
                      id="seed"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder={t("seedPlaceholder")}
                      maxLength={80}
                      required
                    />
                  </Field>
                  <Select
                    items={marketItems}
                    value={locationCode}
                    onValueChange={(value) => value && setLocationCode(value)}
                  >
                    <SelectTrigger className="w-full" aria-label={t("market")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {marketItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    items={limitItems}
                    value={limit}
                    onValueChange={(value) => value && setLimit(value as (typeof LIMITS)[number])}
                  >
                    <SelectTrigger className="w-full" aria-label={t("limitLabel")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {limitItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" disabled={!canRun || research.isPending || !keyword.trim()}>
                    <Search />
                    {t("search")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    value={[mode]}
                    onValueChange={(value) => {
                      const next = value[0];
                      if (next) setMode(next as ResearchMode);
                    }}
                    aria-label={t("modeLabel")}
                  >
                    {MODES.map((value) => (
                      <ToggleGroupItem key={value} value={value}>
                        {t(`modes.${value}.label`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <p className="text-sm text-muted-foreground">
                    {!canRun
                      ? t("viewerNote")
                      : quote.data
                        ? quote.data.cached
                          ? t("quoteCached")
                          : t("quote", { cost: formatUsd(quote.data.estimatedCostUsd, locale) })
                        : t(`modes.${mode}.description`)}
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>

          {research.isPending ? (
            <Skeleton className="h-96 w-full" />
          ) : research.error ? (
            <p className="rounded-lg border border-critical/40 bg-critical/5 p-4 text-sm">
              {errorMessage(research.error, t("failed"))}
            </p>
          ) : research.data ? (
            <Results result={research.data} />
          ) : (
            <EmptyState icon={Search} title={t("emptyTitle")} description={t("emptyBody")} />
          )}
        </TabsContent>
        <TabsContent value="lists" className="mt-4">
          <KeywordLists />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function trendOf(keyword: ResearchKeyword): number | null {
  return keyword.trend?.yearly ?? null;
}

function Results({ result }: { result: KeywordResearchResult }) {
  const t = useTranslations("keywordExplorer");
  const tt = useTranslations("rankTracker.table");
  const locale = useLocale() as Locale;
  const { projects } = useWorkspace();
  const canEdit = useCan("member");
  const [search, setSearch] = useState("");
  const [minVolume, setMinVolume] = useState("");
  const [maxDifficulty, setMaxDifficulty] = useState("");
  const [intent, setIntent] = useState<"all" | SearchIntent>("all");
  const [sort, setSort] = useState<{ key: SortKey; direction: 1 | -1 }>({
    key: "volume",
    direction: -1,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [trackIn, setTrackIn] = useState<Project | null>(null);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(locale);
    const min = Number(minVolume) || 0;
    const max = maxDifficulty === "" ? 100 : Number(maxDifficulty);
    const value = (keyword: ResearchKeyword): number | string | null => {
      switch (sort.key) {
        case "keyword":
          return keyword.keyword;
        case "volume":
          return keyword.searchVolume;
        case "difficulty":
          return keyword.keywordDifficulty;
        case "cpc":
          return keyword.cpc;
        case "trend":
          return trendOf(keyword);
      }
    };
    return result.items
      .filter((keyword) => !needle || keyword.keyword.includes(needle))
      .filter((keyword) => (keyword.searchVolume ?? 0) >= min)
      .filter((keyword) => keyword.keywordDifficulty === null || keyword.keywordDifficulty <= max)
      .filter((keyword) => intent === "all" || keyword.intent === intent)
      .sort((a, b) => {
        const left = value(a);
        const right = value(b);
        if (left === null && right === null) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        const order =
          typeof left === "string" && typeof right === "string"
            ? left.localeCompare(right, locale)
            : Number(left) - Number(right);
        return order * sort.direction;
      });
  }, [result.items, search, minVolume, maxDifficulty, intent, sort, locale]);

  const selectedKeywords = rows
    .filter((row) => selected.has(row.keyword))
    .map((row) => row.keyword);
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.keyword));
  const intentItems = [
    { value: "all", label: t("allIntents") },
    ...(["informational", "navigational", "commercial", "transactional"] as const).map((value) => ({
      value,
      label: t(`intents.${value}`),
    })),
  ];

  function toggleSort(key: SortKey) {
    setSort((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === 1 ? -1 : 1 }
        : { key, direction: key === "keyword" || key === "difficulty" ? 1 : -1 },
    );
  }

  const header = (label: string, key: SortKey, className?: string) => {
    const active = sort.key === key;
    const Icon = !active ? ArrowUpDown : sort.direction === 1 ? ArrowUp : ArrowDown;
    return (
      <TableHead
        className={className}
        aria-sort={active ? (sort.direction === 1 ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
        </button>
      </TableHead>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {result.seed && <SeedCard seed={result.seed} />}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:w-56"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("filter")}
          aria-label={t("filter")}
        />
        <Input
          className="w-32"
          inputMode="numeric"
          value={minVolume}
          onChange={(event) => setMinVolume(event.target.value.replace(/\D/g, ""))}
          placeholder={t("minVolume")}
          aria-label={t("minVolume")}
        />
        <Input
          className="w-28"
          inputMode="numeric"
          value={maxDifficulty}
          onChange={(event) => setMaxDifficulty(event.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder={t("maxDifficulty")}
          aria-label={t("maxDifficulty")}
        />
        <Select
          items={intentItems}
          value={intent}
          onValueChange={(value) => value && setIntent(value as "all" | SearchIntent)}
        >
          <SelectTrigger aria-label={t("intent")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {intentItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground sm:ml-auto">
          {t("resultCount", { shown: rows.length, total: result.totalCount })}
          {" · "}
          {result.cached
            ? t("fromCache", { date: formatDateTime(result.fetchedAt, locale) })
            : t("cost", { cost: formatUsd(result.costUsd, locale) })}
        </span>
      </div>

      {canEdit && selectedKeywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <span className="font-medium">{t("selected", { count: selectedKeywords.length })}</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" variant="outline" disabled={projects.length === 0} />}
            >
              <TrendingUp />
              {t("track")}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("trackIn")}</DropdownMenuLabel>
                {projects.map((candidate) => (
                  <DropdownMenuItem key={candidate.id} onClick={() => setTrackIn(candidate)}>
                    {candidate.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => setSaving(true)}>
            <ListPlus />
            {t("saveToList")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            {t("clearSelection")}
          </Button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit && (
                <TableHead className="w-8">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label={tt("selectPage")}
                    checked={allSelected}
                    onChange={() =>
                      setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.keyword)))
                    }
                  />
                </TableHead>
              )}
              {header(t("columns.keyword"), "keyword", "min-w-56")}
              {header(t("columns.volume"), "volume", "text-right")}
              <TableHead>{t("columns.months")}</TableHead>
              {header(t("columns.trend"), "trend", "text-right")}
              {header(t("columns.difficulty"), "difficulty")}
              {header(t("columns.cpc"), "cpc", "text-right")}
              <TableHead>{t("columns.competition")}</TableHead>
              <TableHead>{t("columns.intent")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  {t("noResults")}
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(0, 500).map((row) => (
                <TableRow key={row.keyword}>
                  {canEdit && (
                    <TableCell>
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={tt("select", { keyword: row.keyword })}
                        checked={selected.has(row.keyword)}
                        onChange={() =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (next.has(row.keyword)) next.delete(row.keyword);
                            else next.add(row.keyword);
                            return next;
                          })
                        }
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{row.keyword}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.searchVolume !== null ? formatCompact(row.searchVolume, locale) : "—"}
                  </TableCell>
                  <TableCell>
                    <Sparkline
                      values={row.monthlySearches.map((month) => month.searchVolume)}
                      label={t("monthsLabel", { keyword: row.keyword })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <TrendValue value={trendOf(row)} />
                  </TableCell>
                  <TableCell>
                    <Difficulty value={row.keywordDifficulty} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.cpc !== null ? formatUsd(row.cpc, locale) : "—"}
                  </TableCell>
                  <TableCell>
                    {row.competitionLevel ? (
                      <Badge variant="outline" className="font-normal">
                        {t(`competition.${row.competitionLevel}`)}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <IntentBadge intent={row.intent} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {trackIn && (
        <AddKeywordsDialog
          key={`${trackIn.id}-${selectedKeywords.join("|")}`}
          project={trackIn}
          open
          onOpenChange={(open) => !open && setTrackIn(null)}
          initialKeywords={selectedKeywords}
          market={{ locationCode: result.locationCode, languageCode: result.languageCode }}
        />
      )}
      <SaveToListDialog
        open={saving}
        onOpenChange={setSaving}
        items={selectedKeywords.map((keyword) => ({
          keyword,
          locationCode: result.locationCode,
          languageCode: result.languageCode,
        }))}
        onSaved={() => setSelected(new Set())}
      />
    </div>
  );
}

function TrendValue({ value }: { value: number | null }) {
  const locale = useLocale() as Locale;
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        value > 0 && "text-positive",
        value < 0 && "text-negative",
        value === 0 && "text-muted-foreground",
      )}
    >
      {formatSignedPercent(value, locale)}
    </span>
  );
}

function SeedCard({ seed }: { seed: ResearchKeyword }) {
  const t = useTranslations("keywordExplorer");
  const locale = useLocale() as Locale;
  return (
    <Card>
      <CardContent className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-3">
          <p className="text-lg font-semibold">{seed.keyword}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">{t("columns.volume")}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {seed.searchVolume !== null ? formatNumber(seed.searchVolume, locale) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("columns.difficulty")}</dt>
              <dd className="text-xl font-semibold">
                <Difficulty value={seed.keywordDifficulty} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("columns.cpc")}</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {seed.cpc !== null ? formatUsd(seed.cpc, locale) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("columns.intent")}</dt>
              <dd className="pt-1">
                <IntentBadge intent={seed.intent} />
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="text-xs text-muted-foreground">{t("columns.months")}</span>
          <Sparkline
            values={seed.monthlySearches.map((month) => month.searchVolume)}
            width={160}
            height={48}
            label={t("monthsLabel", { keyword: seed.keyword })}
          />
          <TrendValue value={trendOf(seed)} />
        </div>
      </CardContent>
    </Card>
  );
}
