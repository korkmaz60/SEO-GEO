import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/lib/format";
import { notBefore } from "@/lib/use-now";

describe("notBefore", () => {
  it("never lets data fetched since the last tick read as future", () => {
    const tick = new Date("2026-09-25T12:00:00Z");
    const fetchedAt = "2026-09-25T12:00:40.000Z";
    expect(notBefore(tick, fetchedAt).toISOString()).toBe(fetchedAt);
    expect(formatRelativeTime(new Date(fetchedAt), "en", notBefore(tick, fetchedAt))).toBe("now");
  });

  it("keeps the current time for older data", () => {
    const tick = new Date("2026-09-25T12:00:00Z");
    expect(notBefore(tick, "2026-09-25T11:57:00Z")).toBe(tick);
    expect(formatRelativeTime(new Date("2026-09-25T11:57:00Z"), "tr", tick)).toBe("3 dakika önce");
  });
});
