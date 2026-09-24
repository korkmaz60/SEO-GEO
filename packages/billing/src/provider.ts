import type { Locale } from "@seo-geo/contracts";

import type { BillingEvent } from "./events.js";

interface CheckoutRequest {
  workspaceId: string;
  /** The workspace's existing provider customer; otherwise checkout creates one. */
  customerId?: string;
  /** Pre-fills the checkout form when there is no customer yet. */
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  locale?: Locale;
}

export interface SubscriptionCheckoutRequest extends CheckoutRequest {
  planId: string;
}

export interface TopUpCheckoutRequest extends CheckoutRequest {
  topUpId: string;
}

export interface PortalRequest {
  customerId: string;
  returnUrl: string;
  locale?: Locale;
}

/** A provider-hosted page the user is redirected to. */
export interface HostedSession {
  id: string;
  url: string;
}

/**
 * What the cloud edition needs from a payment provider. Payment pages are always hosted by
 * the provider, so card data never reaches our servers.
 */
export interface BillingProvider {
  readonly name: string;
  createSubscriptionCheckout(request: SubscriptionCheckoutRequest): Promise<HostedSession>;
  createTopUpCheckout(request: TopUpCheckoutRequest): Promise<HostedSession>;
  /** Plan changes, payment methods, invoices and cancellation. */
  createPortalSession(request: PortalRequest): Promise<{ url: string }>;
  /**
   * Verifies the signature of a webhook delivery and returns the normalized event.
   * `payload` must be the raw request body, byte for byte.
   */
  parseWebhook(payload: string | Uint8Array, signature: string | undefined): Promise<BillingEvent>;
}
