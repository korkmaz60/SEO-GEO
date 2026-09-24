import { describe, expect, it } from "vitest";

import {
  UnsafeUrlError,
  assertAllowedUrl,
  assertPublicUrl,
  isPublicIpAddress,
  resolvePublicAddresses,
  type LookupFunction,
} from "../src/net/index.js";

describe("isPublicIpAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.2.10",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
    "64:ff9b::a00:1",
    "2002:a00:1::1",
    "[::1]",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPublicIpAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "accepts %s",
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true);
    },
  );
});

function expectReason(fn: () => unknown, reason: UnsafeUrlError["reason"]) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(UnsafeUrlError);
    expect((error as UnsafeUrlError).reason).toBe(reason);
    return;
  }
  throw new Error(`expected UnsafeUrlError(${reason})`);
}

describe("assertAllowedUrl", () => {
  it("accepts public http(s) URLs on default ports", () => {
    expect(assertAllowedUrl("https://example.com/a?b=c").hostname).toBe("example.com");
    expect(assertAllowedUrl("http://example.com:80/").port).toBe("");
  });

  it("rejects unsafe URLs", () => {
    expectReason(() => assertAllowedUrl("not a url"), "invalid_url");
    expectReason(() => assertAllowedUrl("file:///etc/passwd"), "unsupported_protocol");
    expectReason(() => assertAllowedUrl("ftp://example.com/"), "unsupported_protocol");
    expectReason(() => assertAllowedUrl("https://user:pw@example.com/"), "credentials_in_url");
    expectReason(() => assertAllowedUrl("http://example.com:5432/"), "port_not_allowed");
    expectReason(
      () => assertAllowedUrl("http://169.254.169.254/latest/meta-data/"),
      "private_address",
    );
    expectReason(() => assertAllowedUrl("http://[::1]/"), "private_address");
    // The URL parser canonicalizes numeric forms before the check.
    expectReason(() => assertAllowedUrl("http://0x7f.1/"), "private_address");
    expectReason(() => assertAllowedUrl("http://2130706433/"), "private_address");
  });

  it("allows extra ports when configured", () => {
    expect(
      assertAllowedUrl("http://example.com:8080/", { allowedPorts: [80, 443, 8080] }).port,
    ).toBe("8080");
  });
});

const fakeLookup =
  (table: Record<string, string[]>): LookupFunction =>
  async (hostname) => {
    const addresses = table[hostname];
    if (!addresses) throw new Error("ENOTFOUND");
    return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  };

describe("resolvePublicAddresses", () => {
  const lookup = fakeLookup({
    "public.test": ["93.184.215.14", "2606:2800:21f:cb07:6820:80da:af6b:8b2c"],
    "internal.test": ["10.0.0.5"],
    "mixed.test": ["93.184.215.14", "127.0.0.1"],
    "empty.test": [],
  });

  it("returns addresses when every record is public", async () => {
    await expect(resolvePublicAddresses("public.test", lookup)).resolves.toHaveLength(2);
  });

  it("refuses names with any non-public record", async () => {
    await expect(resolvePublicAddresses("internal.test", lookup)).rejects.toMatchObject({
      reason: "private_address",
    });
    await expect(resolvePublicAddresses("mixed.test", lookup)).rejects.toMatchObject({
      reason: "private_address",
    });
  });

  it("refuses names that do not resolve", async () => {
    await expect(resolvePublicAddresses("missing.test", lookup)).rejects.toMatchObject({
      reason: "unresolvable_host",
    });
    await expect(resolvePublicAddresses("empty.test", lookup)).rejects.toMatchObject({
      reason: "unresolvable_host",
    });
  });

  it("checks IP literals without DNS", async () => {
    const neverCalled: LookupFunction = async () => {
      throw new Error("lookup should not be called");
    };
    await expect(resolvePublicAddresses("8.8.8.8", neverCalled)).resolves.toEqual([
      { address: "8.8.8.8", family: 4 },
    ]);
    await expect(resolvePublicAddresses("[fe80::1]", neverCalled)).rejects.toMatchObject({
      reason: "private_address",
    });
  });
});

describe("assertPublicUrl", () => {
  it("combines URL checks and DNS checks", async () => {
    const lookup = fakeLookup({ "example.com": ["93.184.215.14"], "rebind.test": ["192.168.0.1"] });
    await expect(assertPublicUrl("https://example.com/", { lookup })).resolves.toMatchObject({
      addresses: [{ address: "93.184.215.14", family: 4 }],
    });
    await expect(assertPublicUrl("https://rebind.test/", { lookup })).rejects.toMatchObject({
      reason: "private_address",
    });
  });
});
