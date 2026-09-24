import { HttpStatus } from "@nestjs/common";
import { ErrorCode } from "@seo-geo/contracts";
import { DataForSeoError } from "@seo-geo/dataforseo";

import { ProblemException } from "../common/problem.exception.js";

/**
 * A DataForSEO failure as the api's problem response: 502 when the provider could not be
 * reached or failed (try again), 422 when it refused the request (e.g. an unsupported
 * market or an empty balance).
 */
export function providerProblem(error: unknown): unknown {
  if (!(error instanceof DataForSeoError)) return error;
  return new ProblemException({
    status: error.retryable ? HttpStatus.BAD_GATEWAY : HttpStatus.UNPROCESSABLE_ENTITY,
    code: ErrorCode.ProviderError,
    detail: `DataForSEO: ${error.message}`,
  });
}
