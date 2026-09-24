import { describe, expect, it } from "vitest";

import { ALL_NAV_ITEMS, NAV_GROUPS } from "@/components/app-shell/nav-config";
import { localeFromAcceptLanguage } from "@/i18n/locale";
import en from "@/messages/en.json";
import tr from "@/messages/tr.json";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    keyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalogs", () => {
  it("have the same keys in Turkish and English", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(tr).sort());
  });

  it("have no empty strings", () => {
    for (const catalog of [tr, en]) {
      const empty = keyPaths(catalog).filter((path) => {
        const text = path
          .split(".")
          .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], catalog);
        return typeof text === "string" && text.trim() === "";
      });
      expect(empty).toEqual([]);
    }
  });

  it("cover every navigation item and page", () => {
    for (const item of ALL_NAV_ITEMS) {
      expect(tr.nav.items[item.key]).toBeTruthy();
      expect(tr.pages[item.key].title).toBeTruthy();
    }
    for (const group of NAV_GROUPS) {
      expect(tr.nav.groups[group.key]).toBeTruthy();
    }
  });
});

describe("localeFromAcceptLanguage", () => {
  it("picks the first supported language and defaults to Turkish", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9,tr;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage("de-DE,tr;q=0.7")).toBe("tr");
    expect(localeFromAcceptLanguage("fr-FR")).toBe("tr");
    expect(localeFromAcceptLanguage(null)).toBe("tr");
  });
});
