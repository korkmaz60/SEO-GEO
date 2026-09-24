import { describe, expect, it } from "vitest";

import { addDays, dateInTimeZone, daysBetween } from "../src/index.js";

describe("dateInTimeZone", () => {
  it("returns the local calendar day", () => {
    const instant = new Date("2026-09-24T22:30:00Z");
    expect(dateInTimeZone(instant, "UTC")).toBe("2026-09-24");
    expect(dateInTimeZone(instant, "Europe/Istanbul")).toBe("2026-09-25");
    expect(dateInTimeZone(instant, "America/New_York")).toBe("2026-09-24");
  });
});

describe("addDays and daysBetween", () => {
  it("work across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-09-17", "2026-09-24")).toBe(7);
    expect(daysBetween("2026-09-24", "2026-09-24")).toBe(0);
  });
});
