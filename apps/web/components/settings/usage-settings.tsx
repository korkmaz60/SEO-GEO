"use client";

import { UsageSummarySchema, type Locale, type UsageSummary } from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { usageQueryKey } from "@/components/app-shell/usage-meter";
import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { KpiTile } from "@/components/data/kpi-tile";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, apiGet, apiSend } from "@/lib/api";
import { formatNumber, formatPercent, formatUsd, intlLocale } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { SettingsSection } from "./settings-section";

const THRESHOLD_OPTIONS = ["50", "80", "90", "100"] as const;

/** The current and the five previous months (UTC), newest first, as `YYYY-MM`. */
function recentMonths(now = new Date()): string[] {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    return date.toISOString().slice(0, 7);
  });
}

export function UsageSettings() {
  const t = useTranslations("workspaceSettings.usage");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const months = recentMonths();
  const [month, setMonth] = useState(months[0] ?? "");
  const current = month === months[0];
  const usage = useQuery({
    queryKey: current ? usageQueryKey(workspace.id) : [...usageQueryKey(workspace.id), month],
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/usage?month=${month}`, UsageSummarySchema, { signal }),
  });
  const monthLabel = (value: string) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}-01T00:00:00Z`));
  const monthItems = months.map((value) => ({ value, label: monthLabel(value) }));
  const data = usage.data;

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title={t("title")}
        description={t("description")}
        action={
          <Select
            items={monthItems}
            value={month}
            onValueChange={(value) => value && setMonth(value)}
          >
            <SelectTrigger size="sm" aria-label={t("month")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {!data ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <KpiTile label={t("spent")} value={formatUsd(data.totalUsd, locale)} emptyLabel="—" />
              <KpiTile
                label={t("budget")}
                value={data.budget ? formatUsd(data.budget.monthlyLimitUsd, locale) : null}
                emptyLabel={t("noBudget")}
              />
              <KpiTile
                label={t("used")}
                value={
                  data.budgetUsedPercent !== null
                    ? formatPercent(data.budgetUsedPercent / 100, locale)
                    : null
                }
                emptyLabel="—"
              />
            </div>
            {data.budgetUsedPercent !== null && (
              <Progress
                value={Math.min(data.budgetUsedPercent, 100)}
                aria-label={t("used")}
                className={cn(
                  data.budgetUsedPercent >= 100
                    ? "[&_[data-slot=progress-indicator]]:bg-critical"
                    : data.budgetUsedPercent >= 80 &&
                        "[&_[data-slot=progress-indicator]]:bg-warning",
                )}
              />
            )}
            {data.byProvider.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("provider")}</TableHead>
                    <TableHead className="text-right">{t("operations")}</TableHead>
                    <TableHead className="text-right">{t("cost")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byProvider.map((row) => (
                    <TableRow key={row.provider}>
                      <TableCell className="font-medium">
                        {t(`providers.${row.provider}`)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.operations, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsd(row.costUsd, locale)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </SettingsSection>

      {isAdmin && current && data && <BudgetForm summary={data} />}
    </div>
  );
}

function BudgetForm({ summary }: { summary: UsageSummary }) {
  const t = useTranslations("workspaceSettings.usage");
  const te = useTranslations("errors");
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const budget = summary.budget;
  const [limit, setLimit] = useState(budget ? String(budget.monthlyLimitUsd) : "");
  const [hardStop, setHardStop] = useState(budget?.hardStop ?? true);
  const [thresholds, setThresholds] = useState<string[]>(
    (budget?.alertThresholds ?? [50, 80, 100]).map(String),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const updated = await apiSend(
        "PUT",
        `/workspaces/${workspace.id}/budget`,
        {
          monthlyLimitUsd: Number(limit.replace(",", ".")),
          hardStop,
          alertThresholds: thresholds.map(Number),
        },
        UsageSummarySchema,
      );
      queryClient.setQueryData(usageQueryKey(workspace.id), updated);
      toast.success(t("budgetSaved"));
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.status === 400 ? t("invalidLimit") : te("generic"),
      );
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    await apiSend("DELETE", `/workspaces/${workspace.id}/budget`);
    await queryClient.invalidateQueries({ queryKey: usageQueryKey(workspace.id) });
    setLimit("");
    toast.success(t("budgetRemoved"));
  }

  return (
    <SettingsSection
      title={t("budgetTitle")}
      description={t("budgetDescription")}
      onSubmit={save}
      footer={
        <>
          {budget && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost">
                  {t("removeBudget")}
                </Button>
              }
              title={t("removeBudgetTitle")}
              description={t("removeBudgetBody")}
              confirmLabel={t("removeBudget")}
              onConfirm={remove}
            />
          )}
          <Button type="submit" disabled={pending || !limit}>
            {t("saveBudget")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="budget-limit">{t("limit")}</FieldLabel>
            <InputGroup className="max-w-48">
              <InputGroupAddon>
                <InputGroupText>$</InputGroupText>
              </InputGroupAddon>
              <InputGroupInput
                id="budget-limit"
                inputMode="decimal"
                value={limit}
                onChange={(event) => setLimit(event.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="100"
                required
              />
            </InputGroup>
            <FieldDescription>{t("limitHint")}</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="budget-hard-stop">{t("hardStop")}</FieldLabel>
              <FieldDescription>{t("hardStopHint")}</FieldDescription>
            </FieldContent>
            <Switch id="budget-hard-stop" checked={hardStop} onCheckedChange={setHardStop} />
          </Field>
          <Field>
            <FieldLabel>{t("alerts")}</FieldLabel>
            <ToggleGroup
              multiple
              variant="outline"
              size="sm"
              value={thresholds}
              onValueChange={(value) => setThresholds(value)}
              aria-label={t("alerts")}
            >
              {THRESHOLD_OPTIONS.map((option) => (
                <ToggleGroupItem key={option} value={option} className="tabular-nums">
                  %{option}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>{t("alertsHint")}</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
    </SettingsSection>
  );
}
