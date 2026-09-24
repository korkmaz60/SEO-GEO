import type { Locale } from "@seo-geo/contracts";

const INTL_LOCALE: Record<Locale, string> = { tr: "tr-TR", en: "en-US" };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

export function formatNumber(value: number, locale: Locale, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits }).format(value);
}

/** Compact notation for KPI tiles: 12.400 → "12,4 B" (tr) / "12.4K" (en). */
export function formatCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** `ratio` is 0–1. */
export function formatPercent(ratio: number, locale: Locale, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits,
  }).format(ratio);
}

export function formatUsd(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2,
  }).format(value);
}

export type Trend = "up" | "down" | "flat";

export interface Delta {
  /** Absolute size of the change. */
  amount: number;
  /** Whether the change is an improvement (`up`), a decline (`down`) or none. */
  trend: Trend;
}

/**
 * Change between two values. For rankings a lower number is better, so moving from
 * position 8 to 3 is an improvement of 5.
 */
export function computeDelta(
  previous: number | null | undefined,
  current: number | null | undefined,
  options: { lowerIsBetter?: boolean } = {},
): Delta | null {
  if (previous == null || current == null) return null;
  const change = options.lowerIsBetter ? previous - current : current - previous;
  if (change === 0) return { amount: 0, trend: "flat" };
  return { amount: Math.abs(change), trend: change > 0 ? "up" : "down" };
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function formatRelativeTime(date: Date, locale: Locale, now: Date = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size || unit === "second") {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(0, "second");
}
