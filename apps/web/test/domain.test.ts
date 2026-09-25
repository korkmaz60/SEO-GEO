import { describe, expect, it } from "vitest";

import { analyzedHost, pathOf } from "@/lib/domain";

describe("analyzedHost", () => {
  it("reduces addresses to the host without www", () => {
    expect(analyzedHost("https://www.Example.com/kahve?ref=x")).toBe("example.com");
    expect(analyzedHost("  blog.example.com.tr ")).toBe("blog.example.com.tr");
    expect(analyzedHost("Example.COM.")).toBe("example.com");
    expect(analyzedHost("kahve.ğ.com")).toBe("kahve.xn--tea.com");
  });

  it("rejects what is not a public hostname", () => {
    expect(analyzedHost("")).toBeNull();
    expect(analyzedHost("not a domain")).toBeNull();
    expect(analyzedHost("localhost")).toBeNull();
    expect(analyzedHost("127.0.0.1")).toBeNull();
    expect(analyzedHost("https://user:pass@example.com")).toBeNull();
  });
});

describe("pathOf", () => {
  it("keeps the path and query of a URL", () => {
    expect(pathOf("https://example.com/kahve?renk=siyah#yorumlar")).toBe("/kahve?renk=siyah");
    expect(pathOf("https://example.com")).toBe("/");
    expect(pathOf("not a url")).toBe("not a url");
    expect(pathOf(null)).toBeNull();
  });
});
