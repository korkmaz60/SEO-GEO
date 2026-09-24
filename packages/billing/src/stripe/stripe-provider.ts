import Stripe from "stripe";

import type { BillingCatalog } from "../catalog.js";
import { BillingError } from "../errors.js";
import {
  SUBSCRIPTION_STATUSES,
  type BillingEvent,
  type SubscriptionSnapshot,
  type SubscriptionStatus,
} from "../events.js";
import type {
  BillingProvider,
  HostedSession,
  PortalRequest,
  SubscriptionCheckoutRequest,
  TopUpCheckoutRequest,
} from "../provider.js";

export interface StripeBillingOptions {
  /** Secret or restricted API key (`sk_…` / `rk_…`). */
  secretKey: string;
  /** Signing secret of the webhook endpoint (`whsec_…`). */
  webhookSecret: string;
  catalog: BillingCatalog;
  /**
   * Use Stripe Managed Payments: Stripe is the merchant of record and calculates, collects and
   * remits sales tax and VAT. Needs an eligible account and products with an eligible tax code.
   */
  managedPayments: boolean;
  /** How long a webhook signature stays valid, in seconds. Defaults to Stripe's 300. */
  webhookToleranceSeconds?: number;
  /** A preconfigured client, for tests. */
  client?: Stripe;
}

type CheckoutMode = "subscription" | "payment";

/** Stripe Checkout, Customer Portal and webhooks behind the provider interface. */
export class StripeBillingProvider implements BillingProvider {
  readonly name = "stripe";
  private readonly stripe: Stripe;
  private readonly catalog: BillingCatalog;
  private readonly webhookSecret: string;
  private readonly managedPayments: boolean;
  private readonly toleranceSeconds: number | undefined;

  constructor(options: StripeBillingOptions) {
    if (!options.secretKey) throw new BillingError("configuration", "Stripe secret key is missing");
    if (!options.webhookSecret) {
      throw new BillingError("configuration", "Stripe webhook signing secret is missing");
    }
    // The SDK pins the API version it was generated for; Managed Payments needs 2026-04-22 or later.
    this.stripe =
      options.client ??
      new Stripe(options.secretKey, { maxNetworkRetries: 2, appInfo: { name: "seo-geo" } });
    this.catalog = options.catalog;
    this.webhookSecret = options.webhookSecret;
    this.managedPayments = options.managedPayments;
    this.toleranceSeconds = options.webhookToleranceSeconds;
  }

  async createSubscriptionCheckout(request: SubscriptionCheckoutRequest): Promise<HostedSession> {
    const plan = this.catalog.plan(request.planId);
    return this.createCheckout(request, "subscription", plan.priceId, { planId: plan.id });
  }

  async createTopUpCheckout(request: TopUpCheckoutRequest): Promise<HostedSession> {
    const topUp = this.catalog.topUp(request.topUpId);
    // The credit amount is fixed at purchase time, so later catalog changes cannot alter it.
    return this.createCheckout(request, "payment", topUp.priceId, {
      topUpId: topUp.id,
      credits: String(topUp.credits),
    });
  }

  async createPortalSession(request: PortalRequest): Promise<{ url: string }> {
    const session = await this.call(() =>
      this.stripe.billingPortal.sessions.create({
        customer: request.customerId,
        return_url: request.returnUrl,
        ...(request.locale ? { locale: request.locale } : {}),
      }),
    );
    return { url: session.url };
  }

  async parseWebhook(
    payload: string | Uint8Array,
    signature: string | undefined,
  ): Promise<BillingEvent> {
    if (!signature) throw new BillingError("invalid_signature", "Missing Stripe-Signature header");
    let event: Stripe.Event;
    try {
      event = await this.stripe.webhooks.constructEventAsync(
        payload,
        signature,
        this.webhookSecret,
        this.toleranceSeconds,
      );
    } catch (cause) {
      throw new BillingError("invalid_signature", "Stripe webhook signature verification failed", {
        cause,
      });
    }
    return this.normalize(event);
  }

  private async createCheckout(
    request: SubscriptionCheckoutRequest | TopUpCheckoutRequest,
    mode: CheckoutMode,
    priceId: string,
    metadata: Record<string, string>,
  ): Promise<HostedSession> {
    const allMetadata = { workspaceId: request.workspaceId, ...metadata };
    const customer = request.customerId
      ? { customer: request.customerId }
      : request.customerEmail
        ? { customer_email: request.customerEmail }
        : {};

    const params: Stripe.Checkout.SessionCreateParams = {
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: request.workspaceId,
      metadata: allMetadata,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      ...customer,
      ...(request.locale ? { locale: request.locale } : {}),
      // Copied onto the subscription so its webhooks identify the workspace too.
      ...(mode === "subscription" ? { subscription_data: { metadata: allMetadata } } : {}),
      ...(this.managedPayments ? { managed_payments: { enabled: true } } : {}),
    };

    const session = await this.call(() => this.stripe.checkout.sessions.create(params));
    if (!session.url) throw new BillingError("provider", "Stripe did not return a Checkout URL");
    return { id: session.id, url: session.url };
  }

  private normalize(event: Stripe.Event): BillingEvent {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return this.checkoutCompleted(event.id, event.data.object);
      case "customer.subscription.created":
      case "customer.subscription.updated":
        return {
          type: "subscription.updated",
          eventId: event.id,
          subscription: this.snapshot(event.data.object),
        };
      case "customer.subscription.deleted":
        return {
          type: "subscription.deleted",
          eventId: event.id,
          subscription: this.snapshot(event.data.object),
        };
      case "invoice.paid": {
        const invoice = event.data.object;
        return {
          type: "invoice.paid",
          eventId: event.id,
          invoiceId: invoice.id,
          customerId: idOf(invoice.customer),
          subscriptionId: idOf(invoice.parent?.subscription_details?.subscription),
          amountPaid: invoice.amount_paid,
          currency: invoice.currency,
        };
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        return {
          type: "invoice.payment_failed",
          eventId: event.id,
          invoiceId: invoice.id,
          customerId: idOf(invoice.customer),
          subscriptionId: idOf(invoice.parent?.subscription_details?.subscription),
        };
      }
      default:
        return { type: "ignored", eventId: event.id, providerType: event.type };
    }
  }

  private checkoutCompleted(eventId: string, session: Stripe.Checkout.Session): BillingEvent {
    const mode: CheckoutMode | null =
      session.mode === "subscription"
        ? "subscription"
        : session.mode === "payment"
          ? "payment"
          : null;
    if (!mode) {
      return { type: "ignored", eventId, providerType: `checkout.session.${session.mode}` };
    }
    const metadata = session.metadata ?? {};
    const credits = Number(metadata.credits);
    const topUp =
      mode === "payment" && metadata.topUpId && Number.isInteger(credits) && credits > 0
        ? { id: metadata.topUpId, credits }
        : null;

    return {
      type: "checkout.completed",
      eventId,
      workspaceId: session.client_reference_id ?? metadata.workspaceId ?? null,
      customerId: idOf(session.customer),
      mode,
      subscriptionId: idOf(session.subscription),
      paid: session.payment_status === "paid" || session.payment_status === "no_payment_required",
      topUp,
    };
  }

  private snapshot(subscription: Stripe.Subscription): SubscriptionSnapshot {
    // Our subscriptions have exactly one item: the plan.
    const item = subscription.items.data[0];
    const priceId = item?.price.id ?? null;
    return {
      subscriptionId: subscription.id,
      customerId: idOf(subscription.customer),
      workspaceId: subscription.metadata.workspaceId ?? null,
      status: toStatus(subscription.status),
      priceId,
      planId: priceId ? (this.catalog.planForPrice(priceId)?.id ?? null) : null,
      currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  }

  private async call<T>(request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Stripe request failed";
      throw new BillingError("provider", message, { cause });
    }
  }
}

function idOf(value: string | { id?: string } | null | undefined): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

/** Statuses Stripe adds in the future count as "no access" until they are mapped here. */
function toStatus(status: string): SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
    ? (status as SubscriptionStatus)
    : "incomplete";
}
