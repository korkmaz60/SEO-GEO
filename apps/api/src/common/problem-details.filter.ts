import { STATUS_CODES } from "node:http";

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import { ErrorCode, PROBLEM_CONTENT_TYPE, type ProblemDetails } from "@seo-geo/contracts";
import type { Request, Response } from "express";
import { ZodError } from "zod";

import { ProblemException } from "./problem.exception.js";
import { getRequestId } from "./request-id.js";

const ROUTER_404 = /^Cannot [A-Z]+ /;

const CODE_BY_STATUS: Record<number, string> = {
  400: ErrorCode.ValidationFailed,
  401: ErrorCode.Unauthorized,
  403: ErrorCode.Forbidden,
  404: ErrorCode.NotFound,
  409: ErrorCode.Conflict,
  429: ErrorCode.RateLimited,
};

/** Renders every error as `application/problem+json` (RFC 9457). */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    // Full path including the /v1 prefix, without the query string (it may carry secrets).
    const path = (request.originalUrl || request.url).split("?")[0] ?? "/";
    const problem = this.toProblem(exception);
    if (
      problem.status === 404 &&
      exception instanceof HttpException &&
      ROUTER_404.test(exception.message)
    ) {
      // The router's message repeats the raw URL, query string included.
      problem.detail = `No route for ${request.method} ${path}`;
    }
    problem.instance = path;
    problem.requestId = getRequestId(request);

    if (problem.status >= 500) {
      this.logger.error(
        `${request.method} ${path} failed (request ${problem.requestId ?? "-"})`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof ProblemException) {
      return this.base(exception.getStatus(), exception.code, exception.message, exception.errors);
    }
    if (exception instanceof ZodError) {
      const validation = ProblemException.validation(exception);
      return this.base(400, validation.code, validation.message, validation.errors);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = CODE_BY_STATUS[status] ?? (status >= 500 ? ErrorCode.Internal : "http_error");
      // Messages of 5xx HttpExceptions may contain internals; keep them out of the response.
      const detail = status >= 500 ? undefined : exception.message;
      return this.base(status, code, detail);
    }
    return this.base(
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.Internal,
      "An unexpected error occurred.",
    );
  }

  private base(
    status: number,
    code: string,
    detail?: string,
    errors?: ProblemDetails["errors"],
  ): ProblemDetails {
    return {
      type: "about:blank",
      title: STATUS_CODES[status] ?? "Error",
      status,
      code,
      ...(detail ? { detail } : {}),
      ...(errors ? { errors } : {}),
    };
  }
}
