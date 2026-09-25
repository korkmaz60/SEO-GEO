import type { Locale } from "@seo-geo/contracts";

const INTL_LOCALE: Record<Locale, string> = { tr: "tr-TR", en: "en-US" };

export function intlLocale(locale: Locale): string {
  return INTL_LOCALE[locale];
}

/** `minimumFractionDigits` keeps decimals aligned in table columns ("41,0" beside "47,4"). */
export function formatNumber(
  value: number,
  locale: Locale,
  maximumFractionDigits = 0,
  minimumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);
}

/** Compact notation for KPI tiles: 12.400 → "12,4 B" (tr) / "12.4K" (en). */
export function formatCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** `ratio` is 0–1. */
export function formatPercent(
  ratio: number,
  locale: Locale,
  maximumFractionDigits = 1,
  minimumFractionDigits = 0,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(ratio);
}

/** A byte size with a binary unit, e.g. "1,2 MB". */
export function formatBytes(bytes: number, locale: Locale): string {
  const units = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "unit",
    unit: units[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

export function formatUsd(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: value !== 0 && Math.abs(value) < 1 ? 4 : 2,
  }).format(value);
}

/** Large amounts in USD for KPI tiles: 4608.18 → "$4.6K" (en) / "$4,6 B" (tr). */
export function formatUsdCompact(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value < 1000 ? 0 : 1,
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

export function formatDate(date: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(
    new Date(date),
  );
}

export function formatDateTime(date: Date | string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
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

/** A calendar day (`YYYY-MM-DD`) as a short label, e.g. "24 Eyl" / "Sep 24". */
export function formatDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** A month (`YYYY-MM-DD`, any day) as a short label, e.g. "Eyl 2026" / "Sep 2026". */
export function formatMonth(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day.slice(0, 10)}T00:00:00Z`));
}

/** A percent change with its sign, e.g. "+%12" (tr) / "+12%" (en); `value` is in percent. */
export function formatSignedPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  }).format(value / 100);
}
