"use client";

import {
  AiPromptDetailSchema,
  type AiAnswer,
  type AiBrand,
  type AiPlatform,
  type Locale,
  type Project,
} from "@seo-geo/contracts";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Clock, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { ExternalLinkIcon } from "@/components/data/external-link";
import { BrandSwatch } from "@/components/projects/brand-swatch";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api";
import { slotColor } from "@/lib/chart-colors";
import { formatDay, formatNumber, formatPercent, formatUsd } from "@/lib/format";
import { findMarket } from "@/lib/locations";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";

import { PLATFORM_NAMES, sortPlatforms } from "./platforms";
import { aiBase, type AiDays } from "./queries";

interface PromptSheetProps {
  project: Project;
  promptId: string | null;
  days: AiDays;
  onClose: () => void;
}

/** A prompt's answers per platform, with the tracked brands highlighted and their sources. */
export function PromptSheet({ project, promptId, days, onClose }: PromptSheetProps) {
  const t = useTranslations("aiVisibility.answer");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const detail = useQuery({
    queryKey: ["ai-visibility", project.id, "prompt", promptId, days],
    queryFn: ({ signal }) =>
      apiGet(
        `${aiBase(workspace.id, project.id)}/prompts/${promptId}?days=${days}`,
        AiPromptDetailSchema,
        { signal },
      ),
    enabled: promptId !== null,
  });
  const data = detail.data;
  const prompt = data?.prompt;
  const market = prompt ? findMarket(prompt.locationCode) : null;

  const byPlatform = new Map<AiPlatform, AiAnswer[]>();
  for (const answer of data?.answers ?? []) {
    byPlatform.set(answer.platform, [...(byPlatform.get(answer.platform) ?? []), answer]);
  }
  const platforms = sortPlatforms([...byPlatform.keys()].map((platform) => ({ platform }))).map(
    (entry) => entry.platform,
  );

  return (
    <Sheet open={promptId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="border-b">
          <SheetTitle className="pr-8 text-lg leading-snug">{prompt?.text ?? " "}</SheetTitle>
          <SheetDescription>
            {prompt
              ? [
                  market ? market.names[locale] : prompt.locationCode,
                  prompt.languageCode,
                  ...prompt.tags,
                ].join(" · ")
              : " "}
          </SheetDescription>
        </SheetHeader>

        {!data || !prompt ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label={t("mentionRate")}>
                {prompt.mentionRate !== null ? formatPercent(prompt.mentionRate, locale, 0) : "—"}
              </Metric>
              <Metric label={t("citationRate")}>
                {prompt.citationRate !== null ? formatPercent(prompt.citationRate, locale, 0) : "—"}
              </Metric>
              <Metric label={t("answers")}>{formatNumber(prompt.runs, locale)}</Metric>
              <Metric label={t("lastRun")}>
                {prompt.lastRunOn ? formatDay(prompt.lastRunOn, locale) : "—"}
              </Metric>
            </dl>

            {platforms.length === 0 ? (
              <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                {prompt.pending ? t("collecting") : t("noAnswers")}
              </p>
            ) : (
              <Tabs defaultValue={platforms[0]}>
                <TabsList className="h-auto flex-wrap justify-start">
                  {platforms.map((platform) => (
                    <TabsTrigger key={platform} value={platform} className="flex-none">
                      {PLATFORM_NAMES[platform]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {platforms.map((platform) => (
                  <TabsContent key={platform} value={platform} className="pt-2">
                    <PlatformAnswers
                      answers={byPlatform.get(platform) ?? []}
                      brands={data.brands}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/** The answers of one platform, newest first; one is shown at a time. */
function PlatformAnswers({ answers, brands }: { answers: AiAnswer[]; brands: AiBrand[] }) {
  const t = useTranslations("aiVisibility.answer");
  const locale = useLocale() as Locale;
  const [selectedId, setSelectedId] = useState(answers[0]?.id);
  const selected = answers.find((answer) => answer.id === selectedId) ?? answers[0];
  if (!selected) return null;
  const own = brands.find((brand) => brand.kind === "OWN");

  return (
    <div className="flex flex-col gap-4">
      {answers.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("history")}>
          {answers.map((answer) => {
            const mentioned = answer.mentions.some((mention) => mention.entityId === own?.entityId);
            return (
              <button
                key={answer.id}
                type="button"
                onClick={() => setSelectedId(answer.id)}
                aria-pressed={answer.id === selected.id}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs tabular-nums",
                  answer.id === selected.id
                    ? "border-foreground/40 bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className="size-2 rounded-full"
                  style={{
                    background: mentioned ? slotColor(1) : "transparent",
                    boxShadow: mentioned ? undefined : "inset 0 0 0 1.5px var(--muted-foreground)",
                  }}
                  aria-hidden
                />
                {formatDay(answer.runOn, locale)}
                {answer.sampleIndex > 0 && ` · ${answer.sampleIndex + 1}`}
              </button>
            );
          })}
        </div>
      )}
      <AnswerView answer={selected} brands={brands} />
    </div>
  );
}

function AnswerView({ answer, brands }: { answer: AiAnswer; brands: AiBrand[] }) {
  const t = useTranslations("aiVisibility.answer");
  const locale = useLocale() as Locale;
  const brandById = new Map(brands.map((brand) => [brand.entityId, brand]));

  if (answer.status === "PENDING") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        <Clock className="size-4" aria-hidden />
        {t("collecting")}
      </p>
    );
  }
  if (answer.status === "FAILED") {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/5 p-4 text-sm">
        <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
        <span>
          {t("failed")}
          {answer.error && (
            <span className="mt-1 block font-mono text-xs text-muted-foreground">
              {answer.error}
            </span>
          )}
        </span>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {[
          formatDay(answer.runOn, locale),
          answer.model,
          t(`methods.${answer.method}` as "methods.llm_scraper"),
          answer.webSearch === true ? t("searchedWeb") : null,
          answer.costUsd > 0 ? formatUsd(answer.costUsd, locale) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {answer.mentions.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("mentions")}>
          {answer.mentions.map((mention) => {
            const brand = brandById.get(mention.entityId);
            return (
              <li
                key={mention.entityId}
                className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs"
              >
                <BrandSwatch slot={brand?.colorSlot ?? 8} />
                <span className="font-medium">{brand?.name ?? t("removedBrand")}</span>
                <span className="text-muted-foreground tabular-nums">
                  {t("mentionSummary", { rank: mention.firstRank, count: mention.mentionCount })}
                </span>
                {mention.sentiment && (
                  <span
                    className={cn(
                      "rounded px-1 font-medium",
                      mention.sentiment === "positive" && "bg-positive/10 text-positive",
                      mention.sentiment === "negative" && "bg-negative/10 text-negative",
                      mention.sentiment === "neutral" && "bg-muted text-muted-foreground",
                    )}
                  >
                    {t(`sentiments.${mention.sentiment}`)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {answer.answer ? (
        <HighlightedAnswer answer={answer} brands={brandById} />
      ) : (
        <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          {t(answer.platform === "GOOGLE_AI_OVERVIEW" ? "noOverview" : "empty")}
        </p>
      )}

      {answer.citations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">
            {t("citations", { count: answer.citations.length })}
          </h3>
          <ol className="flex flex-col divide-y rounded-lg border">
            {answer.citations.map((citation) => {
              const brand = citation.entityId ? brandById.get(citation.entityId) : undefined;
              return (
                <li key={citation.rank} className="flex items-start gap-3 px-3 py-2 text-sm">
                  <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {citation.rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      {brand && <BrandSwatch slot={brand.colorSlot} />}
                      <span className="truncate font-medium">{citation.domain}</span>
                      {citation.pageUrl && (
                        <Badge variant="secondary" className="font-normal">
                          {t("knownPage")}
                        </Badge>
                      )}
                    </p>
                    {citation.title && (
                      <p className="truncate text-xs text-muted-foreground">{citation.title}</p>
                    )}
                  </div>
                  <ExternalLinkIcon url={citation.url} label={t("openSource")} className="mt-1" />
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {answer.fanOutQueries.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t("searches")}</h3>
          <ul className="flex flex-wrap gap-1.5">
            {answer.fanOutQueries.map((query) => (
              <li
                key={query}
                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
              >
                <Search className="size-3 text-muted-foreground" aria-hidden />
                {query}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * The answer as plain text (never rendered as HTML or Markdown), with every brand mention
 * marked in the brand's color. Offsets come from the API and refer to this text.
 */
function HighlightedAnswer({ answer, brands }: { answer: AiAnswer; brands: Map<string, AiBrand> }) {
  const t = useTranslations("aiVisibility.answer");
  const text = answer.answer ?? "";
  const spans = answer.mentions
    .flatMap((mention) =>
      mention.spans.map((span) => ({ ...span, brand: brands.get(mention.entityId) })),
    )
    .filter((span) => span.start >= 0 && span.end <= text.length && span.end > span.start)
    .sort((a, b) => a.start - b.start);

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    if (span.start > cursor) parts.push(text.slice(cursor, span.start));
    const color = slotColor(span.brand?.colorSlot ?? 8);
    parts.push(
      <mark
        key={`${span.start}-${span.end}`}
        className="rounded-sm px-0.5 text-foreground"
        style={{
          background: `color-mix(in oklab, ${color} 22%, transparent)`,
          boxShadow: `inset 0 -2px 0 ${color}`,
        }}
        title={span.brand?.name}
      >
        {text.slice(span.start, span.end)}
      </mark>,
    );
    cursor = span.end;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));

  return (
    <div
      className="max-h-[28rem] overflow-y-auto rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed whitespace-pre-wrap"
      aria-label={t("answerText")}
    >
      {parts}
    </div>
  );
}
