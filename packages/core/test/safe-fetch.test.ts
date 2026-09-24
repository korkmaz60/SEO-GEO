import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SafeFetchError,
  acceptsMediaType,
  createSafeFetcher,
  type LookupFunction,
  type SafeFetcher,
} from "../src/net/index.js";

/** Requests the test server received, by path. */
const seen: { path: string; host?: string; headers: IncomingHttpHeaders }[] = [];

let server: Server;
let port: number;

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    seen.push({ path: url.pathname, host: request.headers.host, headers: request.headers });
    switch (url.pathname) {
      case "/page":
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<h1>Merhaba dünya</h1>");
        return;
      case "/turkish-legacy":
        response.writeHead(200, { "content-type": "text/html; charset=windows-1254" });
        // "Işık" in Windows-1254: I, 0xFE (ş), 0xFD (ı), k
        response.end(Buffer.from([0x49, 0xfe, 0xfd, 0x6b]));
        return;
      case "/json":
        response.writeHead(200, { "content-type": "application/json" });
        response.end("{}");
        return;
      case "/redirect":
        response.writeHead(301, { location: url.searchParams.get("to") ?? "/page" });
        response.end();
        return;
      case "/loop":
        response.writeHead(302, { location: "/loop" });
        response.end();
        return;
      case "/big":
        response.writeHead(200, { "content-type": "text/plain", "content-length": "4096" });
        response.end("x".repeat(4096));
        return;
      case "/big-chunked":
        response.writeHead(200, { "content-type": "text/plain" });
        for (let i = 0; i < 8; i++) response.write("y".repeat(512));
        response.end();
        return;
      case "/gzip-bomb":
        response.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
        response.end(gzipSync(Buffer.alloc(1024 * 1024)));
        return;
      case "/gzip":
        response.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
        response.end(gzipSync("sıkıştırılmış"));
        return;
      case "/slow":
        setTimeout(() => {
          response.writeHead(200, { "content-type": "text/plain" });
          response.end("late");
        }, 1_000);
        return;
      default:
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

/** Every test host name points at the local server; which ones may be contacted varies. */
const lookup: LookupFunction = async (hostname) => {
  const table: Record<string, string[]> = {
    "site.test": ["127.0.0.1"],
    "other.test": ["127.0.0.1"],
    "internal.test": ["10.0.0.7"],
    "mixed.test": ["127.0.0.1", "10.0.0.7"],
  };
  const addresses = table[hostname];
  if (!addresses) throw new Error("ENOTFOUND");
  return addresses.map((address) => ({ address, family: 4 }));
};

/** Treats the loopback server as "public" so the happy paths can run locally. */
const onlyLoopback = (address: string) => address === "127.0.0.1";

function fetcher(overrides: Parameters<typeof createSafeFetcher>[0] = {}): SafeFetcher {
  return createSafeFetcher({
    lookup,
    isAllowedAddress: onlyLoopback,
    allowedPorts: [port],
    ...overrides,
  });
}

async function failure(promise: Promise<unknown>): Promise<SafeFetchError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(SafeFetchError);
    return error as SafeFetchError;
  }
  throw new Error("expected the request to fail");
}

const at = (host: string, path: string) => `http://${host}:${port}${path}`;

describe("createSafeFetcher", () => {
  it("fetches through the checked address and decodes text", async () => {
    const client = fetcher();
    const response = await client.fetch(at("site.test", "/page"), { accept: ["text/html"] });
    expect(response).toMatchObject({
      status: 200,
      contentType: "text/html",
      url: at("site.test", "/page"),
      redirects: [],
    });
    expect(response.text()).toBe("<h1>Merhaba dünya</h1>");
    expect(seen.at(-1)).toMatchObject({ path: "/page", host: `site.test:${port}` });
    expect(seen.at(-1)?.headers["user-agent"]).toMatch(/^SEO-GEO-Bot\//);

    expect((await client.fetch(at("site.test", "/turkish-legacy"))).text()).toBe("Işık");
    expect((await client.fetch(at("site.test", "/gzip"))).text()).toBe("sıkıştırılmış");
    const head = await client.fetch(at("site.test", "/page"), { method: "HEAD" });
    expect(head.body).toHaveLength(0);
    await client.close();
  });

  it("refuses host names that resolve to internal addresses, before connecting", async () => {
    const client = createSafeFetcher({ lookup, allowedPorts: [port] });
    const before = seen.length;
    expect((await failure(client.fetch(at("site.test", "/page")))).reason).toBe("private_address");
    expect((await failure(client.fetch(at("internal.test", "/page")))).reason).toBe(
      "private_address",
    );
    expect((await failure(client.fetch(at("mixed.test", "/page")))).reason).toBe("private_address");
    expect((await failure(client.fetch(`http://127.0.0.1:${port}/page`))).reason).toBe(
      "private_address",
    );
    expect(
      (await failure(client.fetch(`http://169.254.169.254:${port}/latest/meta-data/`))).reason,
    ).toBe("private_address");
    expect((await failure(client.fetch(at("missing.test", "/")))).reason).toBe("unresolvable_host");
    expect(seen.length).toBe(before);
    await client.close();
  });

  it("applies the URL policy to the first URL and to every redirect", async () => {
    const client = fetcher();
    expect((await failure(client.fetch("file:///etc/passwd"))).reason).toBe("unsupported_protocol");
    expect((await failure(client.fetch("http://site.test:5432/"))).reason).toBe("port_not_allowed");

    const followed = await client.fetch(at("site.test", "/redirect?to=/page"));
    expect(followed).toMatchObject({
      status: 200,
      url: at("site.test", "/page"),
      redirects: [at("site.test", "/redirect?to=/page")],
    });

    for (const target of [
      at("internal.test", "/page"),
      `http://169.254.169.254:${port}/latest/meta-data/`,
      `http://127.0.0.1:${port}/page`.replace("127.0.0.1", "[::1]"),
    ]) {
      const error = await failure(
        client.fetch(at("site.test", `/redirect?to=${encodeURIComponent(target)}`)),
      );
      expect(error.reason).toBe("private_address");
    }
    expect(
      (await failure(client.fetch(at("site.test", "/redirect?to=ftp://site.test/")))).reason,
    ).toBe("unsupported_protocol");
    expect(
      (await failure(client.fetch(at("site.test", "/loop"), { maxRedirects: 3 }))).reason,
    ).toBe("too_many_redirects");
    await client.close();
  });

  it("drops credentials when a redirect leaves the origin", async () => {
    const client = fetcher();
    await client.fetch(
      at("site.test", `/redirect?to=${encodeURIComponent(at("other.test", "/page"))}`),
      { headers: { Authorization: "Bearer secret", Cookie: "a=b" } },
    );
    const [first, second] = seen.slice(-2);
    expect(first?.headers.authorization).toBe("Bearer secret");
    expect(second).toMatchObject({ path: "/page", host: `other.test:${port}` });
    expect(second?.headers.authorization).toBeUndefined();
    expect(second?.headers.cookie).toBeUndefined();
    await client.close();
  });

  it("bounds size, decompressed size, media type and time", async () => {
    const client = fetcher();
    expect((await failure(client.fetch(at("site.test", "/big"), { maxBytes: 1024 }))).reason).toBe(
      "too_large",
    );
    expect(
      (await failure(client.fetch(at("site.test", "/big-chunked"), { maxBytes: 1024 }))).reason,
    ).toBe("too_large");
    expect(
      (await failure(client.fetch(at("site.test", "/gzip-bomb"), { maxBytes: 64 * 1024 }))).reason,
    ).toBe("too_large");
    expect(
      (await failure(client.fetch(at("site.test", "/json"), { accept: ["text/*"] }))).reason,
    ).toBe("content_type");
    expect((await failure(client.fetch(at("site.test", "/slow"), { timeoutMs: 200 }))).reason).toBe(
      "timeout",
    );
    // The client stays usable after failures.
    expect((await client.fetch(at("site.test", "/page"))).status).toBe(200);
    await client.close();
  });
});

describe("acceptsMediaType", () => {
  it("matches exact types and whole families", () => {
    expect(acceptsMediaType(["text/html"], "text/html")).toBe(true);
    expect(acceptsMediaType(["text/*"], "text/plain")).toBe(true);
    expect(acceptsMediaType(["text/html"], "application/json")).toBe(false);
    expect(acceptsMediaType(["text/*"], null)).toBe(false);
  });
});
