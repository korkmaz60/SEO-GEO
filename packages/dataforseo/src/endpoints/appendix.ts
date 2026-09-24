import { z } from "zod";

import type { DataForSeoClient } from "../client.js";
import { DataForSeoError } from "../errors.js";

const USER_DATA_PATH = "/appendix/user_data";

const UserDataResultSchema = z.looseObject({
  login: z.string().optional(),
  money: z.looseObject({
    balance: z.number(),
  }),
});

export interface AccountInfo {
  login: string | null;
  /** Remaining prepaid balance in USD. */
  balanceUsd: number;
}

/**
 * Account details and remaining balance. The endpoint is free, which makes it the
 * connection test for stored credentials.
 */
export async function getAccountInfo(client: DataForSeoClient): Promise<AccountInfo> {
  const { result } = await client.getOne<unknown>(USER_DATA_PATH);
  const parsed = UserDataResultSchema.safeParse(result[0]);
  if (!parsed.success) {
    throw new DataForSeoError({
      kind: "invalid_response",
      message: "Unexpected user_data response",
      path: USER_DATA_PATH,
      retryable: false,
      cause: parsed.error,
    });
  }
  return { login: parsed.data.login ?? null, balanceUsd: parsed.data.money.balance };
}
