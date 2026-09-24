export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "paused",
  "canceled",
  "incomplete",
  "incomplete_expired",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

const STATUSES_WITH_ACCESS: ReadonlySet<SubscriptionStatus> = new Set([
  "trialing",
  "active",
  "past_due",
]);

/**
 * Whether a subscription in this state keeps its paid features. `past_due` keeps access while
 * the provider retries the payment; the subscription becomes `unpaid` or `canceled` when the
 * retries run out.
 */
export function hasAccess(status: SubscriptionStatus): boolean {
  return STATUSES_WITH_ACCESS.has(status);
}

/** A subscription as the provider reports it after a change. */
export interface SubscriptionSnapshot {
  subscriptionId: string;
  customerId: string | null;
  /** Set by our checkout; `null` for subscriptions created elsewhere (e.g. in the dashboard). */
  workspaceId: string | null;
  status: SubscriptionStatus;
  priceId: string | null;
  /** `null` when the price is not in the catalog, e.g. a retired price. */
  planId: string | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Provider webhooks reduced to what the billing service acts on. `eventId` is the provider's
 * event ID; the service stores processed IDs so that retried deliveries are no-ops.
 */
export type BillingEvent =
  | {
      type: "checkout.completed";
      eventId: string;
      workspaceId: string | null;
      customerId: string | null;
      mode: "subscription" | "payment";
      subscriptionId: string | null;
      /** `false` while an asynchronous payment method (e.g. a bank debit) is still pending. */
      paid: boolean;
      /** Set for credit top-up purchases. */
      topUp: { id: string; credits: number } | null;
    }
  | { type: "subscription.updated"; eventId: string; subscription: SubscriptionSnapshot }
  | { type: "subscription.deleted"; eventId: string; subscription: SubscriptionSnapshot }
  | {
      type: "invoice.paid";
      eventId: string;
      invoiceId: string;
      customerId: string | null;
      subscriptionId: string | null;
      /** In the currency's minor unit (e.g. cents). */
      amountPaid: number;
      currency: string;
    }
  | {
      type: "invoice.payment_failed";
      eventId: string;
      invoiceId: string;
      customerId: string | null;
      subscriptionId: string | null;
    }
  | { type: "ignored"; eventId: string; providerType: string };
