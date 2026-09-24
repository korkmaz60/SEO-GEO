"use client";

import { UsageSummarySchema, type Locale } from "@seo-geo/contracts";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Progress } from "@/components/ui/progress";
import { apiGet } from "@/lib/api";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";

export function usageQueryKey(workspaceId: string) {
  return ["usage", workspaceId] as const;
}

/** This month's provider spend against the budget, linking to usage settings. */
export function UsageMeter({ className }: { className?: string }) {
  const t = useTranslations("shell.usage");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const { data } = useQuery({
    queryKey: usageQueryKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/usage`, UsageSummarySchema, { signal }),
    refetchInterval: 120_000,
  });
  const percent = data?.budgetUsedPercent ?? null;

  return (
    <Link
      href={`/${workspace.slug}/settings/usage`}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border px-3 py-2 transition-colors hover:bg-sidebar-accent",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">{t("title")}</span>
      <span className="text-sm font-medium tabular-nums">
        {data ? formatUsd(data.totalUsd, locale) : "—"}
        {data?.budget && (
          <span className="font-normal text-muted-foreground">
            {" / "}
            {formatUsd(data.budget.monthlyLimitUsd, locale)}
          </span>
        )}
      </span>
      {percent !== null ? (
        <Progress
          value={Math.min(percent, 100)}
          aria-label={t("budgetUsed", { percent: Math.round(percent) })}
          className={cn(
            percent >= 100
              ? "[&_[data-slot=progress-indicator]]:bg-critical"
              : percent >= 80 && "[&_[data-slot=progress-indicator]]:bg-warning",
          )}
        />
      ) : (
        <span className="text-xs text-muted-foreground">{t("noBudget")}</span>
      )}
    </Link>
  );
}
