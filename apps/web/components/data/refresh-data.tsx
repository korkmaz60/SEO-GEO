"use client";

import type { Locale } from "@seo-geo/contracts";
import { RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatRelativeTime, formatUsd } from "@/lib/format";

/**
 * Refresh for cached provider data (D23): shows when the data was fetched and what loading it
 * again costs, and runs only when confirmed. The new data replaces the cached copy for every
 * workspace.
 */
export function RefreshDataButton({
  fetchedAt,
  costUsd,
  onRefresh,
  disabled = false,
}: {
  fetchedAt: string;
  /** Upper bound of the refresh; `undefined` while it is being quoted. */
  costUsd: number | undefined;
  onRefresh: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const t = useTranslations("refreshData");
  const locale = useLocale() as Locale;
  // When the dialog opened, so "fetched 3 days ago" is current whenever it is read.
  const [openedAt, setOpenedAt] = useState(() => new Date());
  const cost = costUsd === undefined ? null : formatUsd(costUsd, locale);

  return (
    <ConfirmDialog
      onOpenChange={(open) => {
        if (open) setOpenedAt(new Date());
      }}
      trigger={
        <Button size="sm" variant="outline" disabled={disabled}>
          <RefreshCw />
          {t("button")}
        </Button>
      }
      title={t("title")}
      description={
        <p>
          {t("body", {
            relative: formatRelativeTime(new Date(fetchedAt), locale, openedAt),
            date: formatDateTime(fetchedAt, locale),
            cost: cost ?? "…",
          })}
        </p>
      }
      confirmLabel={cost ? t("confirm", { cost }) : t("button")}
      destructive={false}
      disabled={cost === null}
      onConfirm={async () => {
        try {
          await onRefresh();
        } catch (error) {
          throw new Error(errorMessage(error, t("failed")));
        }
      }}
    />
  );
}
