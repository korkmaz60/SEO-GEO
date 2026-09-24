export type BillingErrorKind =
  /** Missing keys or an invalid plan catalog. */
  | "configuration"
  /** A webhook whose signature is missing, wrong or too old. */
  | "invalid_signature"
  | "unknown_plan"
  | "unknown_top_up"
  /** The payment provider rejected a request or returned something unusable. */
  | "provider";

export class BillingError extends Error {
  readonly kind: BillingErrorKind;

  constructor(kind: BillingErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "BillingError";
    this.kind = kind;
  }
}
