import { describe, expect, it } from "vitest";

import { estimateLabsCost, estimateSerpCost, roundUsd, serpPages } from "../src/index.js";

describe("serpPages", () => {
  it("counts pages of 10 results", () => {
    expect([1, 10, 11, 30, 100, 700].map(serpPages)).toEqual([1, 1, 2, 3, 10, 70]);
  });
});

describe("estimateSerpCost", () => {
  it("prices the first page by mode and further pages at 75%", () => {
    expect(estimateSerpCost({ mode: "standard" })).toBe(0.0006);
    expect(estimateSerpCost({ mode: "priority" })).toBe(0.0012);
    expect(estimateSerpCost({ mode: "live" })).toBe(0.002);
    // 0.0006 × (1 + 0.75 × 2)
    expect(estimateSerpCost({ mode: "standard", depth: 30 })).toBe(0.0015);
    // 0.0006 × (1 + 0.75 × 9)
    expect(estimateSerpCost({ mode: "standard", depth: 100 })).toBe(0.00465);
  });

  it("adds the asynchronous AI Overview surcharge and multiplies by count", () => {
    expect(estimateSerpCost({ mode: "standard", depth: 30, loadAsyncAiOverview: true })).toBe(
      0.0021,
    );
    expect(
      estimateSerpCost({ mode: "standard", depth: 30, loadAsyncAiOverview: true, count: 250 }),
    ).toBe(0.525);
  });
});

describe("estimateLabsCost", () => {
  it("charges per request and per returned row", () => {
    expect(estimateLabsCost({ items: 100 })).toBe(0.024);
    expect(estimateLabsCost({ items: 0, requests: 2 })).toBe(0.024);
  });
});

describe("roundUsd", () => {
  it("rounds to six decimals", () => {
    expect(roundUsd(0.1 + 0.2)).toBe(0.3);
    expect(roundUsd(0.0000004)).toBe(0);
  });
});
