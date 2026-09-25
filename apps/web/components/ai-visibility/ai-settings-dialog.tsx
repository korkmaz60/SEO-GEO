"use client";

import {
  AI_PLATFORMS,
  AiCostQuoteSchema,
  AiModelsSchema,
  AiSettingsSchema,
  MAX_AI_SAMPLES,
  MODEL_PLATFORMS,
  type AiFrequency,
  type AiPlatform,
  type AiSettings,
  type Locale,
  type ModelPlatform,
} from "@seo-geo/contracts";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { formatNumber, formatUsd } from "@/lib/format";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useWorkspace } from "@/lib/workspace-context";

import { PLATFORM_NAMES } from "./platforms";

const DEFAULT_MODEL = "__default__";

interface AiSettingsDialogProps {
  projectId: string;
  settings: AiSettings;
  providerReady: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Platforms, schedule, samples, models and sentiment, with the cost before saving. */
export function AiSettingsDialog({
  projectId,
  settings,
  providerReady,
  open,
  onOpenChange,
}: AiSettingsDialogProps) {
  const t = useTranslations("aiVisibility.settings");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<AiSettings>(settings);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/workspaces/${workspace.id}/projects/${projectId}/ai-visibility`;

  const draftKey = useDebouncedValue(JSON.stringify(draft), 300);
  const quote = useQuery({
    queryKey: ["ai-quote", projectId, draftKey],
    queryFn: () =>
      apiSend("POST", `${base}/settings/quote`, JSON.parse(draftKey), AiCostQuoteSchema),
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  function reset(next: boolean) {
    if (next) setDraft(settings);
    setError(null);
    onOpenChange(next);
  }

  function togglePlatform(platform: AiPlatform, enabled: boolean) {
    setDraft((current) => ({
      ...current,
      platforms: AI_PLATFORMS.filter((entry) =>
        entry === platform ? enabled : current.platforms.includes(entry),
      ),
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await apiSend("PATCH", `${base}/settings`, draft, AiSettingsSchema);
      toast.success(t("saved"));
      await queryClient.invalidateQueries({ queryKey: ["ai-visibility", projectId] });
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, t("failed")));
    } finally {
      setPending(false);
    }
  }

  const frequencyItems = (["WEEKLY", "DAILY"] as const).map((value) => ({
    value,
    label: t(`frequencies.${value}`),
  }));
  const sampleItems = Array.from({ length: MAX_AI_SAMPLES }, (_, index) => ({
    value: String(index + 1),
    label: formatNumber(index + 1, locale),
  }));
  const data = quote.data;

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />

          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-sm font-medium">{t("platforms")}</legend>
            <ul className="flex flex-col divide-y rounded-lg border">
              {AI_PLATFORMS.map((platform) => {
                const id = `platform-${platform}`;
                return (
                  <li key={platform} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <label htmlFor={id} className="text-sm font-medium">
                        {PLATFORM_NAMES[platform]}
                      </label>
                      <p className="text-xs text-muted-foreground">{t(`methods.${platform}`)}</p>
                    </div>
                    <Switch
                      id={id}
                      checked={draft.platforms.includes(platform)}
                      onCheckedChange={(checked) => togglePlatform(platform, checked)}
                    />
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t("frequency")}</FieldLabel>
                <Select
                  items={frequencyItems}
                  value={draft.frequency}
                  onValueChange={(value) =>
                    value && setDraft({ ...draft, frequency: value as AiFrequency })
                  }
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
              <Field>
                <FieldLabel>{t("samples")}</FieldLabel>
                <Select
                  items={sampleItems}
                  value={String(draft.samples)}
                  onValueChange={(value) => value && setDraft({ ...draft, samples: Number(value) })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sampleItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <FieldDescription>{t("samplesHint")}</FieldDescription>

            {MODEL_PLATFORMS.filter((platform) => draft.platforms.includes(platform)).map(
              (platform) => (
                <ModelField
                  key={platform}
                  base={base}
                  platform={platform}
                  enabled={open && providerReady}
                  value={draft.models[platform]}
                  onChange={(model) =>
                    setDraft({ ...draft, models: { ...draft.models, [platform]: model } })
                  }
                />
              ),
            )}

            <div className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <label htmlFor="ai-sentiment" className="text-sm font-medium">
                  {t("sentiment")}
                </label>
                <p className="text-xs text-muted-foreground">{t("sentimentHint")}</p>
              </div>
              <Switch
                id="ai-sentiment"
                checked={draft.sentiment}
                onCheckedChange={(checked) => setDraft({ ...draft, sentiment: checked })}
              />
            </div>
          </FieldGroup>

          {data && (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border bg-muted/40 p-3 text-sm">
              <dt className="text-muted-foreground">
                {t("answersPerPeriod", { frequency: draft.frequency })}
              </dt>
              <dd className="text-right tabular-nums">
                {formatNumber(data.answersPerPeriod, locale)}
              </dd>
              {data.platforms.map((entry) => (
                <div key={entry.platform} className="contents text-xs">
                  <dt className="pl-3 text-muted-foreground">
                    {PLATFORM_NAMES[entry.platform]}
                    {entry.model && <span className="ml-1 font-mono">({entry.model})</span>}
                  </dt>
                  <dd className="text-right tabular-nums">{formatUsd(entry.costUsd, locale)}</dd>
                </div>
              ))}
              {data.sentimentUsd > 0 && (
                <>
                  <dt className="pl-3 text-xs text-muted-foreground">{t("sentimentCost")}</dt>
                  <dd className="text-right text-xs tabular-nums">
                    {formatUsd(data.sentimentUsd, locale)}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">
                {t("perPeriod", { frequency: draft.frequency })}
              </dt>
              <dd className="text-right tabular-nums">{formatUsd(data.perPeriodUsd, locale)}</dd>
              <dt className="font-medium">{t("perMonth")}</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatUsd(data.perMonthUsd, locale)}
              </dd>
              <p className="col-span-2 pt-1 text-xs text-muted-foreground">
                {t("costNote", { prompts: data.prompts })}
              </p>
            </dl>
          )}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ModelField({
  base,
  platform,
  enabled,
  value,
  onChange,
}: {
  base: string;
  platform: ModelPlatform;
  enabled: boolean;
  value: string | null;
  onChange: (model: string | null) => void;
}) {
  const t = useTranslations("aiVisibility.settings");
  const locale = useLocale() as Locale;
  const models = useQuery({
    queryKey: ["ai-models", base, platform],
    queryFn: ({ signal }) =>
      apiGet(`${base}/models/${platform.toLowerCase()}`, AiModelsSchema, { signal }),
    enabled,
    staleTime: 60 * 60_000,
  });
  const listed = models.data?.models ?? [];
  const fallback = listed.find((model) => model.isDefault);
  const items = [
    {
      value: DEFAULT_MODEL,
      label: fallback ? t("defaultModelNamed", { model: fallback.name }) : t("defaultModel"),
    },
    ...listed.map((model) => ({
      value: model.name,
      label: `${model.name} · ${t("perAnswer", { cost: formatUsd(model.estimatedCostUsd, locale) })}`,
    })),
    // A saved model that is no longer listed stays selectable.
    ...(value && !listed.some((model) => model.name === value) ? [{ value, label: value }] : []),
  ];
  return (
    <Field>
      <FieldLabel>{t("model", { platform: PLATFORM_NAMES[platform] })}</FieldLabel>
      <Select
        items={items}
        value={value ?? DEFAULT_MODEL}
        onValueChange={(next) => next && onChange(next === DEFAULT_MODEL ? null : next)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
