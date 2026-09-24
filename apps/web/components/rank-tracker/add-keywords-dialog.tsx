"use client";

import {
  TrackKeywordsQuoteSchema,
  TrackKeywordsResultSchema,
  type Device,
  type Locale,
  type Project,
  type RankFrequency,
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
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useWorkspace } from "@/lib/workspace-context";

const QUOTE_DELAY_MS = 400;

export function splitKeywords(value: string): string[] {
  return value
    .split(/[\n,;]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

interface AddKeywordsDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Keywords to start with, e.g. from the keyword explorer. */
  initialKeywords?: string[];
  market?: { locationCode: number; languageCode: string };
}

/** Adds keywords to the rank tracker after showing what they will cost. */
export function AddKeywordsDialog({
  project,
  open,
  onOpenChange,
  initialKeywords,
  market,
}: AddKeywordsDialogProps) {
  const t = useTranslations("rankTracker.add");
  const td = useTranslations("projectSettings.devices");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialKeywords?.join("\n") ?? "");
  const [tags, setTags] = useState("");
  const [device, setDevice] = useState<Device>(project.device);
  const [frequency, setFrequency] = useState<RankFrequency>("DAILY");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/workspaces/${workspace.id}/projects/${project.id}/rank-tracker`;
  const keywords = splitKeywords(text);

  const request = {
    keywords,
    device,
    frequency,
    tags: tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    ...(market ?? {}),
  };
  const requestKey = useDebouncedValue(JSON.stringify(request), QUOTE_DELAY_MS);
  const debounced = JSON.parse(requestKey) as typeof request;
  const quoteQuery = useQuery({
    queryKey: ["rank-tracker-quote", project.id, requestKey],
    queryFn: () => apiSend("POST", `${base}/keywords/quote`, debounced, TrackKeywordsQuoteSchema),
    // The debounced request lags behind the text; never quote an empty list.
    enabled: open && keywords.length > 0 && debounced.keywords.length > 0,
    staleTime: 60_000,
  });
  const quote = keywords.length > 0 ? (quoteQuery.data ?? null) : null;

  function reset(next: boolean) {
    onOpenChange(next);
    if (!next) setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await apiSend("POST", `${base}/keywords`, request, TrackKeywordsResultSchema);
      toast.success(t("added", { count: result.added }));
      await queryClient.invalidateQueries({ queryKey: ["rank-tracker", project.id] });
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

  const deviceItems = (["DESKTOP", "MOBILE"] as const).map((value) => ({
    value,
    label: td(value),
  }));
  const frequencyItems = (["DAILY", "WEEKLY"] as const).map((value) => ({
    value,
    label: t(`frequencies.${value}`),
  }));
  const newCount = quote?.keywords.length ?? 0;

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
              <FieldLabel htmlFor="keywords">{t("keywords")}</FieldLabel>
              <Textarea
                id="keywords"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t("placeholder")}
                rows={7}
                className="font-mono text-sm"
                required
              />
              <FieldDescription>{t("keywordsHint")}</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("device")}</FieldLabel>
                <Select
                  items={deviceItems}
                  value={device}
                  onValueChange={(value) => value && setDevice(value as Device)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {deviceItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t("frequency")}</FieldLabel>
                <Select
                  items={frequencyItems}
                  value={frequency}
                  onValueChange={(value) => value && setFrequency(value as RankFrequency)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {frequencyItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="tags">{t("tags")}</FieldLabel>
              <Input
                id="tags"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder={t("tagsPlaceholder")}
              />
            </Field>
          </FieldGroup>

          {quote && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
              <dt className="text-muted-foreground">{t("newKeywords")}</dt>
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
              {quote.invalid.length > 0 && (
                <>
                  <dt className="text-muted-foreground">{t("invalid")}</dt>
                  <dd className="text-right tabular-nums">
                    {formatNumber(quote.invalid.length, locale)}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">{t("checkCost")}</dt>
              <dd className="text-right tabular-nums">{formatUsd(quote.checkCostUsd, locale)}</dd>
              <dt className="text-muted-foreground">{t("monthlyCost")}</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatUsd(quote.monthlyCostUsd, locale)}
              </dd>
              {quote.metricsCostUsd > 0 && (
                <>
                  <dt className="text-muted-foreground">{t("metricsCost")}</dt>
                  <dd className="text-right tabular-nums">
                    {formatUsd(quote.metricsCostUsd, locale)}
                  </dd>
                </>
              )}
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
