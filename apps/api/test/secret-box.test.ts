import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SecretBox } from "../src/crypto/secret-box.js";
import { slugify } from "../src/projects/projects.service.js";

describe("SecretBox", () => {
  const box = new SecretBox(new Map([[1, randomBytes(32)]]), 1);
  const context = "provider_credential:workspace-a:DATAFORSEO";

  it("round-trips secrets and never produces the same ciphertext twice", () => {
    const first = box.seal("s3cret-password", context);
    const second = box.seal("s3cret-password", context);

    expect(box.open(first.ciphertext, first.keyVersion, context)).toBe("s3cret-password");
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
    expect(Buffer.from(first.ciphertext).toString("latin1")).not.toContain("s3cret");
  });

  it("refuses ciphertexts that were changed or moved to another context", () => {
    const sealed = box.seal("s3cret-password", context);
    const tampered = Uint8Array.from(sealed.ciphertext);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;

    expect(() => box.open(tampered, 1, context)).toThrow();
    expect(() =>
      box.open(sealed.ciphertext, 1, "provider_credential:workspace-b:DATAFORSEO"),
    ).toThrow();
    expect(() => box.open(sealed.ciphertext, 2, context)).toThrow(/version 2/);
  });

  it("opens secrets sealed with an older key after rotation", () => {
    const oldKey = randomBytes(32);
    const sealed = new SecretBox(new Map([[1, oldKey]]), 1).seal("kept", context);
    const rotated = new SecretBox(
      new Map([
        [1, oldKey],
        [2, randomBytes(32)],
      ]),
      2,
    );

    expect(rotated.open(sealed.ciphertext, sealed.keyVersion, context)).toBe("kept");
    expect(rotated.seal("new", context).keyVersion).toBe(2);
  });
});

describe("slugify", () => {
  it("turns hosts into readable slugs", () => {
    expect(slugify("ornek.com.tr")).toBe("ornek-com-tr");
    expect(slugify("xn--irket-idb.com.tr")).toBe("irket-idb-com-tr");
    expect(slugify("a".repeat(80) + ".com")).toHaveLength(50);
  });
});
