import { describe, expect, it } from "vitest";

import { safeExternalHref } from "@/lib/external-url";

describe("safeExternalHref", () => {
  it("links only absolute http(s) URLs", () => {
    expect(safeExternalHref("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeExternalHref("http://example.com")).toBe("http://example.com/");
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref(" JavaScript:alert(1)")).toBeNull();
    expect(safeExternalHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalHref("/relative/path")).toBeNull();
    expect(safeExternalHref("")).toBeNull();
    expect(safeExternalHref(null)).toBeNull();
  });
});
