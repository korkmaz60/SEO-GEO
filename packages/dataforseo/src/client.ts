import {
  FIRST_SERVER_ERROR_CODE,
  ResponseEnvelopeSchema,
  STATUS_OK,
  STATUS_TASK_CREATED,
  StatusOnlySchema,
  type TaskEnvelope,
} from "./envelope.js";
import { DataForSeoError } from "./errors.js";

export const DATAFORSEO_API_URL = "https://api.dataforseo.com/v3";
/** Free sandbox that returns sample data; useful for integration tests. */
export const DATAFORSEO_SANDBOX_URL = "https://sandbox.dataforseo.com/v3";

export interface DataForSeoClientOptions {
  login: string;
  password: string;
  /** Defaults to {@link DATAFORSEO_API_URL}. */
  baseUrl?: string;
  /** Per-attempt timeout. Defaults to 60 seconds. */
  timeoutMs?: number;
  /** Retries after the first attempt for retryable errors. Defaults to 2. */
  maxRetries?: number;
  /** First backoff delay; doubles on every retry. Defaults to 500 ms. */
  retryBaseDelayMs?: number;
  /** Upper bound for any single backoff delay. Defaults to 30 seconds. */
  maxRetryDelayMs?: number;
  userAgent?: string;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Source of randomness for jitter, in [0, 1). */
  random?: () => number;
}

export type TaskOutcome<TResult> =
  | {
      ok: true;
      id: string;
      statusCode: number;
      cost: number;
      result: TResult[];
      data: Record<string, unknown>;
    }
  | {
      ok: false;
      id: string;
      statusCode: number;
      cost: number;
      error: DataForSeoError;
      data: Record<string, unknown>;
    };

export interface DataForSeoResponse<TResult> {
  /** Total cost of the request in USD, as reported by DataForSEO. */
  cost: number;
  tasks: TaskOutcome<TResult>[];
}

export interface SingleTaskResult<TResult> {
  id: string;
  result: TResult[];
  cost: number;
}

type Method = "GET" | "POST";

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class DataForSeoClient {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(options: DataForSeoClientOptions) {
    if (!options.login || !options.password) {
      throw new Error("DataForSEO login and password are required");
    }
    this.baseUrl = (options.baseUrl ?? DATAFORSEO_API_URL).replace(/\/+$/, "");
    this.authorization =
      "Basic " + Buffer.from(`${options.login}:${options.password}`).toString("base64");
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? 500;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? 30_000;
    this.userAgent = options.userAgent ?? "seo-geo-dataforseo-client";
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
    this.random = options.random ?? Math.random;
  }

  get<TResult>(path: string): Promise<DataForSeoResponse<TResult>> {
    return this.request<TResult>("GET", path);
  }

  post<TResult>(path: string, tasks: readonly object[]): Promise<DataForSeoResponse<TResult>> {
    return this.request<TResult>("POST", path, tasks);
  }

  /** GET an endpoint that returns a single task; throws when that task failed. */
  async getOne<TResult>(path: string): Promise<SingleTaskResult<TResult>> {
    return firstTask(await this.get<TResult>(path), path);
  }

  /** POST a single task; throws when it failed. */
  async postOne<TResult>(path: string, task: object): Promise<SingleTaskResult<TResult>> {
    return firstTask(await this.post<TResult>(path, [task]), path);
  }

  private async request<TResult>(
    method: Method,
    path: string,
    body?: readonly object[],
  ): Promise<DataForSeoResponse<TResult>> {
    const url = this.baseUrl + (path.startsWith("/") ? path : `/${path}`);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.attempt<TResult>(method, url, path, body);
      } catch (error) {
        if (!(error instanceof DataForSeoError) || !error.retryable || attempt >= this.maxRetries) {
          throw error;
        }
        await this.sleep(this.backoffDelay(attempt, error.retryAfterMs));
      }
    }
  }

  private async attempt<TResult>(
    method: Method,
    url: string,
    path: string,
    body: readonly object[] | undefined,
  ): Promise<DataForSeoResponse<TResult>> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: this.authorization,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": this.userAgent,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (cause) {
      const timedOut =
        cause instanceof DOMException &&
        (cause.name === "TimeoutError" || cause.name === "AbortError");
      throw new DataForSeoError({
        kind: timedOut ? "timeout" : "network",
        message: timedOut
          ? `DataForSEO request timed out after ${this.timeoutMs} ms`
          : "DataForSEO request failed before a response was received",
        path,
        retryable: true,
        cause,
      });
    }

    let text: string;
    try {
      text = await response.text();
    } catch (cause) {
      throw new DataForSeoError({
        kind: "network",
        message: "DataForSEO response body could not be read",
        path,
        retryable: true,
        cause,
      });
    }
    const json = parseJson(text);

    if (!response.ok) {
      const status = StatusOnlySchema.safeParse(json);
      throw new DataForSeoError({
        kind: "http",
        message: status.success
          ? status.data.status_message
          : `DataForSEO responded with HTTP ${response.status}`,
        path,
        httpStatus: response.status,
        statusCode: status.success ? status.data.status_code : undefined,
        retryable: response.status === 429 || response.status >= 500,
        retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
      });
    }

    const parsed = ResponseEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      throw new DataForSeoError({
        kind: "invalid_response",
        message: "DataForSEO returned a body that is not a valid response envelope",
        path,
        retryable: false,
        cause: parsed.error,
      });
    }

    const envelope = parsed.data;
    if (envelope.status_code !== STATUS_OK) {
      throw new DataForSeoError({
        kind: "api",
        message: envelope.status_message,
        path,
        statusCode: envelope.status_code,
        retryable: envelope.status_code >= FIRST_SERVER_ERROR_CODE,
      });
    }

    return {
      cost: envelope.cost ?? 0,
      tasks: (envelope.tasks ?? []).map((task) => toOutcome<TResult>(task, path)),
    };
  }

  private backoffDelay(attempt: number, retryAfterMs: number | undefined): number {
    if (retryAfterMs !== undefined) return Math.min(retryAfterMs, this.maxRetryDelayMs);
    const exponential = this.retryBaseDelayMs * 2 ** attempt;
    // Full jitter between 50% and 100% of the exponential delay.
    return Math.min(this.maxRetryDelayMs, Math.round(exponential * (0.5 + this.random() * 0.5)));
  }
}

function toOutcome<TResult>(task: TaskEnvelope, path: string): TaskOutcome<TResult> {
  const cost = task.cost ?? 0;
  if (task.status_code === STATUS_OK || task.status_code === STATUS_TASK_CREATED) {
    return {
      ok: true,
      id: task.id,
      statusCode: task.status_code,
      cost,
      result: (task.result ?? []) as TResult[],
      data: task.data ?? {},
    };
  }
  return {
    ok: false,
    id: task.id,
    statusCode: task.status_code,
    cost,
    data: task.data ?? {},
    error: new DataForSeoError({
      kind: "task",
      message: task.status_message,
      path,
      statusCode: task.status_code,
      taskId: task.id,
      retryable: task.status_code >= FIRST_SERVER_ERROR_CODE,
    }),
  };
}

function firstTask<TResult>(
  response: DataForSeoResponse<TResult>,
  path: string,
): SingleTaskResult<TResult> {
  const task = response.tasks[0];
  if (!task) {
    throw new DataForSeoError({
      kind: "invalid_response",
      message: "DataForSEO response contained no tasks",
      path,
      retryable: false,
    });
  }
  if (!task.ok) throw task.error;
  return { id: task.id, result: task.result, cost: response.cost };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
