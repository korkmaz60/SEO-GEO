"use client";

import {
  CreatePromptsQuoteSchema,
  CreatePromptsResultSchema,
  MAX_PROMPT_LENGTH,
  type Locale,
  type Project,
} from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiSend, errorMessage } from "@/lib/api";
import { formatNumber, formatUsd } from "@/lib/format";
import { MARKETS, findMarket } from "@/lib/locations";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useWorkspace } from "@/lib/workspace-context";

/** One prompt per line; prompts may contain commas. */
export function splitPrompts(value: string): string[] {
  return value
    .split("\n")
    .map((prompt) => prompt.trim())
    .filter(Boolean);
}

interface AddPromptsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Adds prompts after showing how many are new and what asking them costs. */
export function AddPromptsDialog({ project, open, onOpenChange }: AddPromptsDialogProps) {
  const t = useTranslations("aiVisibility.add");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [tags, setTags] = useState("");
  const [market, setMarket] = useState(String(project.locationCode));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/workspaces/${workspace.id}/projects/${project.id}/ai-visibility`;
  const prompts = splitPrompts(text);
  const selected = MARKETS.find((entry) => String(entry.locationCode) === market);

  const request = {
    prompts,
    tags: tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    ...(selected && selected.locationCode !== project.locationCode
      ? { locationCode: selected.locationCode, languageCode: selected.languageCode }
      : {}),
  };
  const requestKey = useDebouncedValue(JSON.stringify(request), 400);
  const debounced = JSON.parse(requestKey) as typeof request;
  const quoteQuery = useQuery({
    queryKey: ["ai-prompts-quote", project.id, requestKey],
    queryFn: () => apiSend("POST", `${base}/prompts/quote`, debounced, CreatePromptsQuoteSchema),
    enabled: open && prompts.length > 0 && debounced.prompts.length > 0,
    staleTime: 60_000,
  });
  const quote = prompts.length > 0 ? (quoteQuery.data ?? null) : null;
  const tooLong = prompts.filter((prompt) => prompt.length > MAX_PROMPT_LENGTH).length;

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await apiSend("POST", `${base}/prompts`, request, CreatePromptsResultSchema);
      toast.success(t("added", { count: result.added }));
      await queryClient.invalidateQueries({ queryKey: ["ai-visibility", project.id] });
      setText("");
      reset(false);
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.problem?.code === "budget_exceeded"
          ? t("budgetExceeded")
          : errorMessage(caught, t("failed")),
      );
    } finally {
      setPending(false);
    }
  }

  const marketItems = [
    // A project market outside the list stays the default.
    ...(findMarket(project.locationCode)
      ? []
      : [
          {
            value: String(project.locationCode),
            label: `${project.locationCode} · ${project.languageCode}`,
          },
        ]),
    ...MARKETS.map((entry) => ({
      value: String(entry.locationCode),
      label: `${entry.names[locale]} · ${entry.languageCode}`,
    })),
  ];
  const newCount = quote?.prompts ?? 0;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="prompts">{t("prompts")}</FieldLabel>
              <Textarea
                id="prompts"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("placeholder")}
                rows={7}
                className="text-sm"
                required
              />
              <FieldDescription>
                {tooLong > 0
                  ? t("tooLong", { count: tooLong, max: MAX_PROMPT_LENGTH })
                  : t("promptsHint")}
              </FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("market")}</FieldLabel>
                <Select
                  items={marketItems}
                  value={market}
                  onValueChange={(value) => value && setMarket(value)}
                >
                  <SelectTrigger className="w-full">
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
              </Field>
              <Field>
                <FieldLabel htmlFor="prompt-tags">{t("tags")}</FieldLabel>
                <Input
                  id="prompt-tags"
                  value={tags}
                  onChange={(event) => setTags(event.target.value)}
                  placeholder={t("tagsPlaceholder")}
                />
              </Field>
            </div>
          </FieldGroup>

          {quote && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
              <dt className="text-muted-foreground">{t("newPrompts")}</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatNumber(newCount, locale)}
              </dd>
              {quote.duplicates > 0 && (
                <>
                  <dt className="text-muted-foreground">{t("duplicates")}</dt>
                  <dd className="text-right tabular-nums">
                    {formatNumber(quote.duplicates, locale)}
                  </dd>
                </>
              )}
              {quote.invalid > 0 && (
                <>
                  <dt className="text-muted-foreground">{t("invalid")}</dt>
                  <dd className="text-right tabular-nums">{formatNumber(quote.invalid, locale)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">
                {t("perPeriod", { frequency: quote.frequency })}
              </dt>
              <dd className="text-right tabular-nums">{formatUsd(quote.perPeriodUsd, locale)}</dd>
              <dt className="text-muted-foreground">{t("perMonth")}</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatUsd(quote.perMonthUsd, locale)}
              </dd>
              <p className="col-span-2 pt-1 text-xs text-muted-foreground">{t("costNote")}</p>
            </dl>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending || newCount === 0}>
              {t("submit", { count: newCount })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
