import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface SealedSecret {
  ciphertext: Uint8Array<ArrayBuffer>;
  keyVersion: number;
}

/**
 * Authenticated encryption for secrets at rest (AES-256-GCM). The `context` is bound as
 * associated data, so a ciphertext copied to another row or workspace fails to open.
 * Layout: IV (12 bytes) | auth tag (16 bytes) | ciphertext.
 */
export class SecretBox {
  constructor(
    private readonly keys: ReadonlyMap<number, Buffer>,
    private readonly currentVersion: number,
  ) {
    if (!keys.has(currentVersion)) throw new Error(`No key for version ${currentVersion}`);
  }

  seal(plaintext: string, context: string): SealedSecret {
    const key = this.keys.get(this.currentVersion) as Buffer;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from(context, "utf8"));
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
    return { ciphertext: new Uint8Array(sealed), keyVersion: this.currentVersion };
  }

  /** Throws when the key is unknown, the data was changed or the context differs. */
  open(ciphertext: Uint8Array, keyVersion: number, context: string): string {
    const key = this.keys.get(keyVersion);
    if (!key) throw new Error(`No key for version ${keyVersion}`);
    const data = Buffer.from(ciphertext);
    const decipher = createDecipheriv(ALGORITHM, key, data.subarray(0, IV_BYTES));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(data.subarray(IV_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  }
}

/** The instance's secret box, keyed by ENCRYPTION_KEY as key version 1. */
@Injectable()
export class SecretBoxService extends SecretBox {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super(new Map([[1, config.encryptionKey]]), 1);
  }
}
