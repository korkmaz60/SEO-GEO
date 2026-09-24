export type DataForSeoErrorKind =
  /** The request never got an HTTP response (DNS, connection reset, …). */
  | "network"
  /** The request exceeded the client timeout. */
  | "timeout"
  /** The server answered with a non-2xx HTTP status. */
  | "http"
  /** HTTP 200, but the response envelope reports an error `status_code`. */
  | "api"
  /** The envelope succeeded, but this task failed. */
  | "task"
  /** The body was not the JSON envelope we expect. */
  | "invalid_response";

export interface DataForSeoErrorInit {
  kind: DataForSeoErrorKind;
  message: string;
  path: string;
  retryable: boolean;
  /** DataForSEO status code, e.g. 40501 or 50000. */
  statusCode?: number;
  httpStatus?: number;
  taskId?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class DataForSeoError extends Error {
  readonly kind: DataForSeoErrorKind;
  readonly path: string;
  readonly retryable: boolean;
  readonly statusCode: number | undefined;
  readonly httpStatus: number | undefined;
  readonly taskId: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(init: DataForSeoErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "DataForSeoError";
    this.kind = init.kind;
    this.path = init.path;
    this.retryable = init.retryable;
    this.statusCode = init.statusCode;
    this.httpStatus = init.httpStatus;
    this.taskId = init.taskId;
    this.retryAfterMs = init.retryAfterMs;
  }
}
