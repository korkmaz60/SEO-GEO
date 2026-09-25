import { describe, expect, it } from "vitest";

import {
  computeDelta,
  formatBytes,
  formatCompact,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatUsd,
} from "@/lib/format";

describe("number formatting", () => {
  it("follows the locale's separators", () => {
    expect(formatNumber(1234.5, "tr", 1)).toBe("1.234,5");
    expect(formatNumber(1234.5, "en", 1)).toBe("1,234.5");
    expect(formatPercent(0.384, "tr")).toBe("%38,4");
    expect(formatPercent(0.384, "en")).toBe("38.4%");
    expect(formatCompact(12_400, "en")).toBe("12.4K");
  });

  it("keeps a fixed number of decimals when asked", () => {
    expect(formatNumber(41, "tr", 1)).toBe("41");
    expect(formatNumber(41, "tr", 1, 1)).toBe("41,0");
    expect(formatPercent(0.08, "tr", 1, 1)).toBe("%8,0");
  });

  it("formats byte sizes with binary units", () => {
    expect(formatBytes(512, "en")).toBe("512 byte");
    expect(formatBytes(2.5 * 1024 * 1024, "en")).toBe("2.5 MB");
    expect(formatBytes(2.5 * 1024 * 1024, "tr")).toBe("2,5 MB");
  });

  it("shows small provider costs with enough precision", () => {
    expect(formatUsd(0.0024, "en")).toBe("$0.0024");
    expect(formatUsd(12.5, "en")).toBe("$12.50");
    expect(formatUsd(0, "en")).toBe("$0.00");
  });
});

describe("computeDelta", () => {
  it("treats a lower position as an improvement for rankings", () => {
    expect(computeDelta(8, 3, { lowerIsBetter: true })).toEqual({ amount: 5, trend: "up" });
    expect(computeDelta(3, 8, { lowerIsBetter: true })).toEqual({ amount: 5, trend: "down" });
  });

  it("handles regular metrics, no change and missing data", () => {
    expect(computeDelta(10, 12)).toEqual({ amount: 2, trend: "up" });
    expect(computeDelta(5, 5)).toEqual({ amount: 0, trend: "flat" });
    expect(computeDelta(null, 5)).toBeNull();
    expect(computeDelta(5, undefined)).toBeNull();
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-09-24T12:00:00Z");
  it("picks a sensible unit", () => {
    expect(formatRelativeTime(new Date("2026-09-24T11:58:00Z"), "en", now)).toBe("2 minutes ago");
    expect(formatRelativeTime(new Date("2026-09-23T12:00:00Z"), "en", now)).toBe("yesterday");
    expect(formatRelativeTime(new Date("2026-09-23T12:00:00Z"), "tr", now)).toBe("dün");
  });
});
