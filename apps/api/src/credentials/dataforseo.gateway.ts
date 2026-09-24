import { Inject, Injectable } from "@nestjs/common";
import { DataForSeoClient, DataForSeoError, getAccountInfo } from "@seo-geo/dataforseo";

export interface DataForSeoOptions {
  baseUrl?: string;
  /** Replaced in tests. */
  fetch?: typeof globalThis.fetch;
}

/** Injection token for {@link DataForSeoOptions}. */
export const DATAFORSEO_OPTIONS = Symbol("DATAFORSEO_OPTIONS");

export interface DataForSeoLogin {
  login: string;
  password: string;
}

export type VerificationResult =
  | { status: "valid"; login: string; balanceUsd: number }
  /** DataForSEO refused the credentials or the account (4xx). */
  | { status: "rejected"; message: string }
  /** Network error, timeout or a DataForSEO server error: try again later. */
  | { status: "unreachable"; message: string };

@Injectable()
export class DataForSeoGateway {
  constructor(@Inject(DATAFORSEO_OPTIONS) private readonly options: DataForSeoOptions) {}

  client(credentials: DataForSeoLogin): DataForSeoClient {
    return new DataForSeoClient({
      login: credentials.login,
      password: credentials.password,
      baseUrl: this.options.baseUrl,
      fetch: this.options.fetch,
      timeoutMs: 20_000,
      maxRetries: 1,
      userAgent: "seo-geo",
    });
  }

  /** Checks the credentials with the free account endpoint and returns the balance. */
  async verify(credentials: DataForSeoLogin): Promise<VerificationResult> {
    try {
      const account = await getAccountInfo(this.client(credentials));
      return {
        status: "valid",
        login: account.login ?? credentials.login,
        balanceUsd: account.balanceUsd,
      };
    } catch (error) {
      if (!(error instanceof DataForSeoError)) throw error;
      return error.retryable
        ? { status: "unreachable", message: error.message }
        : { status: "rejected", message: error.message };
    }
  }
}
