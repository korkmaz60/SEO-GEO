import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode, type FieldError } from "@seo-geo/contracts";
import type { z } from "zod";

export interface ProblemInit {
  status: number;
  code: string;
  detail?: string;
  errors?: FieldError[];
}

/**
 * An error that maps one-to-one to an RFC 9457 problem response. Throw it from services and
 * controllers; {@link ProblemDetailsFilter} renders it.
 */
export class ProblemException extends HttpException {
  readonly code: string;
  readonly errors: FieldError[] | undefined;

  constructor(init: ProblemInit) {
    super(init.detail ?? init.code, init.status);
    this.code = init.code;
    this.errors = init.errors;
  }

  static validation(error: z.ZodError): ProblemException {
    return new ProblemException({
      status: HttpStatus.BAD_REQUEST,
      code: ErrorCode.ValidationFailed,
      detail: "The request is not valid.",
      errors: error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
  }

  static notFound(detail = "The requested resource was not found."): ProblemException {
    return new ProblemException({ status: HttpStatus.NOT_FOUND, code: ErrorCode.NotFound, detail });
  }
}
