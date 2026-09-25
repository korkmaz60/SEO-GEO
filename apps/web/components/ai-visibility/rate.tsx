import type { AiRate, Locale } from "@seo-geo/contracts";
import { useTranslations } from "next-intl";

import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "33%" or "—". */
export function formatRate(rate: AiRate | null | undefined, locale: Locale): string {
  return rate ? formatPercent(rate.value, locale, 0) : "—";
}

/**
 * A rate with its 95% interval: the estimate as a dot on a 0–100% track and the interval as a
 * thin bar, so a wide bar reads as "uncertain". The numbers are in the accessible label and
 * the tooltip text.
 */
export function RateBar({
  rate,
  locale,
  color = "var(--chart-1)",
  className,
}: {
  rate: AiRate | null;
  locale: Locale;
  color?: string;
  className?: string;
}) {
  const t = useTranslations("aiVisibility");
  if (!rate) return <span className="text-muted-foreground">—</span>;
  const label = t("rateWithInterval", {
    value: formatPercent(rate.value, locale, 0),
    low: formatPercent(rate.low, locale, 0),
    high: formatPercent(rate.high, locale, 0),
  });
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      title={label}
      aria-label={label}
      role="img"
    >
      <span className="w-10 text-right font-medium tabular-nums">
        {formatPercent(rate.value, locale, 0)}
      </span>
      <span className="relative h-2 w-16 shrink-0 rounded-full bg-muted" aria-hidden>
        <span
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-40"
          style={{
            left: `${rate.low * 100}%`,
            width: `${Math.max(1, (rate.high - rate.low) * 100)}%`,
            background: color,
          }}
        />
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card"
          style={{ left: `${rate.value * 100}%`, background: color }}
        />
      </span>
    </span>
  );
}

/** "Low sample" marker for fewer than 20 answers. */
export function LowSampleBadge({ runs }: { runs: number }) {
  const t = useTranslations("aiVisibility");
  return (
    <span
      className="inline-flex items-center rounded-full border border-dashed px-1.5 py-px text-[11px] text-muted-foreground"
      title={t("lowSampleHint", { runs })}
    >
      {t("lowSample")}
    </span>
  );
}
