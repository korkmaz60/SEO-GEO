import { describe, expect, it } from "vitest";

import {
  InvalidHostnameError,
  hostMatchesDomain,
  isValidHostname,
  normalizeHostname,
  registrableDomain,
  tryNormalizeHostname,
} from "../src/index.js";

describe("normalizeHostname", () => {
  it.each([
    ["https://www.Example.com/path?x=1", "www.example.com"],
    ["  Example.COM.  ", "example.com"],
    ["example.com:8080", "example.com"],
    ["sub.example.co.uk", "sub.example.co.uk"],
    ["müller.de", "xn--mller-kva.de"],
    ["şirket.com.tr", "xn--irket-idb.com.tr"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "localhost",
    "10.0.0.1",
    "http://[::1]/",
    "exa mple.com",
    "-bad.com",
    "user:pw@example.com",
  ])("rejects %j", (input) => {
    expect(() => normalizeHostname(input)).toThrow(InvalidHostnameError);
    expect(tryNormalizeHostname(input)).toBeNull();
  });
});

describe("isValidHostname", () => {
  it("requires a TLD with a letter and valid labels", () => {
    expect(isValidHostname("example.com")).toBe(true);
    expect(isValidHostname("a.b.c.example")).toBe(true);
    expect(isValidHostname("192.168.1.1")).toBe(false);
    expect(isValidHostname("example")).toBe(false);
    expect(isValidHostname(`${"a".repeat(64)}.com`)).toBe(false);
  });
});

describe("registrableDomain", () => {
  it("uses the Public Suffix List", () => {
    expect(registrableDomain("blog.example.co.uk")).toBe("example.co.uk");
    expect(registrableDomain("https://shop.example.com.tr/cart")).toBe("example.com.tr");
    expect(registrableDomain("docs.acme.github.io")).toBe("acme.github.io");
    expect(registrableDomain("not a host")).toBeNull();
  });
});

describe("hostMatchesDomain", () => {
  it("matches exact hosts and ignores www", () => {
    expect(hostMatchesDomain("example.com", "example.com")).toBe(true);
    expect(hostMatchesDomain("www.example.com", "example.com")).toBe(true);
    expect(hostMatchesDomain("https://WWW.Example.com/page", "www.example.com")).toBe(true);
  });

  it("never matches by substring", () => {
    expect(hostMatchesDomain("notexample.com", "example.com")).toBe(false);
    expect(hostMatchesDomain("example.com.evil.net", "example.com")).toBe(false);
    expect(hostMatchesDomain("https://evil.net/?u=example.com", "example.com")).toBe(false);
  });

  it("matches subdomains only when asked", () => {
    expect(hostMatchesDomain("blog.example.com", "example.com")).toBe(false);
    expect(hostMatchesDomain("blog.example.com", "example.com", { includeSubdomains: true })).toBe(
      true,
    );
  });

  it("returns false for invalid input", () => {
    expect(hostMatchesDomain("not a url", "example.com")).toBe(false);
    expect(hostMatchesDomain("example.com", "")).toBe(false);
  });
});
