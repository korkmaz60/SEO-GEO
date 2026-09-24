"use client";

import type { Locale } from "@seo-geo/contracts";
import { useLocale, useTranslations } from "next-intl";

import { TimeSeriesChart } from "@/components/charts/time-series-chart";
import { slotColor } from "@/lib/chart-colors";
import { formatDay, formatNumber } from "@/lib/format";

/** Daily Search Console clicks for the overview; the formatters live on the client. */
export function TrafficChart({ daily }: { daily: { date: string; clicks: number }[] }) {
  const t = useTranslations("overview.traffic");
  const locale = useLocale() as Locale;
  return (
    <TimeSeriesChart
      data={daily}
      series={[{ key: "clicks", label: t("clicks"), color: slotColor(1) }]}
      yDomain={[0, "auto"]}
      formatDate={(day) => formatDay(day, locale)}
      formatValue={(value) => formatNumber(value, locale)}
      tableLabel={t("tableView")}
      dateLabel={t("date")}
      className="h-48"
    />
  );
}
