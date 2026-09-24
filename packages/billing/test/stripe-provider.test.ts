import Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  BillingCatalog,
  BillingError,
  StripeBillingProvider,
  hasAccess,
  type StripeBillingOptions,
} from "../src/index.js";

const WEBHOOK_SECRET = "whsec_test_secret";

const catalog = BillingCatalog.parse({
  plans: [
    {
      id: "starter",
      name: "Starter",
      priceId: "price_starter",
      limits: {
        projects: 3,
        trackedKeywords: 500,
        aiPrompts: 50,
        members: 2,
        monthlyCredits: 1000,
      },
    },
    {
      id: "agency",
      name: "Agency",
      priceId: "price_agency",
      limits: {
        projects: 50,
        trackedKeywords: 10_000,
        aiPrompts: 1000,
        members: 20,
        monthlyCredits: 20_000,
      },
    },
  ],
  topUps: [{ id: "credits-5k", name: "5,000 credits", priceId: "price_topup_5k", credits: 5000 }],
});

const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_test_1";

function setup(
  options: Partial<StripeBillingOptions> = {},
  session: { id: string; url: string | null } = { id: "cs_test_1", url: CHECKOUT_URL },
) {
  const createCheckout = vi.fn(async (_params: Record<string, unknown>) => session);
  const createPortal = vi.fn(async (_params: Record<string, unknown>) => ({
    url: "https://billing.stripe.com/p/session/test",
  }));
  const client = {
    checkout: { sessions: { create: createCheckout } },
    billingPortal: { sessions: { create: createPortal } },
    webhooks: Stripe.webhooks,
  } as unknown as Stripe;
  const provider = new StripeBillingProvider({
    secretKey: "sk_test_123",
    webhookSecret: WEBHOOK_SECRET,
    catalog,
    managedPayments: true,
    client,
    ...options,
  });
  return { provider, createCheckout, createPortal };
}

const request = {
  workspaceId: "ws_1",
  successUrl: "https://app.example.com/billing?status=success",
  cancelUrl: "https://app.example.com/billing",
};

function stripeEvent(type: string, object: object, id = "evt_test_1") {
  return {
    id,
    object: "event",
    type,
    api_version: "2026-08-26.dahlia",
    created: 1_790_000_000,
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
}

async function sign(
  event: object,
  { secret = WEBHOOK_SECRET, timestamp }: { secret?: string; timestamp?: number } = {},
) {
  const payload = JSON.stringify(event);
  const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
    ...(timestamp === undefined ? {} : { timestamp }),
  });
  return { payload, signature };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    object: "subscription",
    customer: "cus_123",
    status: "active",
    cancel_at_period_end: false,
    metadata: { workspaceId: "ws_1", planId: "starter" },
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          current_period_end: 1_790_000_000,
          price: { id: "price_starter", object: "price" },
        },
      ],
    },
    ...overrides,
  };
}

describe("BillingCatalog", () => {
  it("looks up plans by id and by price", () => {
    expect(catalog.plan("agency").limits.projects).toBe(50);
    expect(catalog.planForPrice("price_starter")?.id).toBe("starter");
    expect(catalog.planForPrice("price_retired")).toBeUndefined();
    expect(() => catalog.plan("enterprise")).toThrow(
      expect.objectContaining({ kind: "unknown_plan" }),
    );
    expect(catalog.topUp("credits-5k").credits).toBe(5000);
  });

  it("rejects duplicate ids and prices", () => {
    const limits = { projects: 1, trackedKeywords: 1, aiPrompts: 1, members: 1, monthlyCredits: 1 };
    const parse = () =>
      BillingCatalog.parse({
        plans: [
          { id: "starter", name: "A", priceId: "price_a", limits },
          { id: "starter", name: "B", priceId: "price_a", limits },
        ],
      });
    expect(parse).toThrow(BillingError);
    expect(parse).toThrow(/Duplicate id "starter"/);
    expect(parse).toThrow(/Price "price_a" is used twice/);
  });
});

describe("StripeBillingProvider checkout", () => {
  it("creates a Managed Payments subscription checkout tied to the workspace", async () => {
    const { provider, createCheckout } = setup();

    const session = await provider.createSubscriptionCheckout({
      ...request,
      planId: "agency",
      customerEmail: "owner@example.com",
      locale: "tr",
    });

    expect(session).toEqual({ id: "cs_test_1", url: CHECKOUT_URL });
    const metadata = { workspaceId: "ws_1", planId: "agency" };
    expect(createCheckout).toHaveBeenCalledWith({
      mode: "subscription",
      line_items: [{ price: "price_agency", quantity: 1 }],
      client_reference_id: "ws_1",
      metadata,
      success_url: request.successUrl,
      cancel_url: request.cancelUrl,
      customer_email: "owner@example.com",
      locale: "tr",
      subscription_data: { metadata },
      managed_payments: { enabled: true },
    });
  });

  it("reuses the workspace's customer and can run without Managed Payments", async () => {
    const { provider, createCheckout } = setup({ managedPayments: false });

    await provider.createSubscriptionCheckout({
      ...request,
      planId: "starter",
      customerId: "cus_123",
      customerEmail: "ignored@example.com",
    });

    const params = createCheckout.mock.calls[0]?.[0];
    expect(params).toMatchObject({ customer: "cus_123" });
    expect(params).not.toHaveProperty("customer_email");
    expect(params).not.toHaveProperty("managed_payments");
  });

  it("fixes the credit amount of a top-up at purchase time", async () => {
    const { provider, createCheckout } = setup();

    await provider.createTopUpCheckout({
      ...request,
      topUpId: "credits-5k",
      customerId: "cus_123",
    });

    const params = createCheckout.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      mode: "payment",
      line_items: [{ price: "price_topup_5k", quantity: 1 }],
      metadata: { workspaceId: "ws_1", topUpId: "credits-5k", credits: "5000" },
      managed_payments: { enabled: true },
    });
    expect(params).not.toHaveProperty("subscription_data");
  });

  it("rejects unknown plans without calling Stripe", async () => {
    const { provider, createCheckout } = setup();

    await expect(
      provider.createSubscriptionCheckout({ ...request, planId: "enterprise" }),
    ).rejects.toMatchObject({ kind: "unknown_plan" });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("wraps Stripe errors and unusable responses", async () => {
    const failing = setup();
    failing.createCheckout.mockRejectedValueOnce(new Error("No such price: 'price_agency'"));
    await expect(
      failing.provider.createSubscriptionCheckout({ ...request, planId: "agency" }),
    ).rejects.toMatchObject({ kind: "provider", message: "No such price: 'price_agency'" });

    const noUrl = setup({}, { id: "cs_test_2", url: null });
    await expect(
      noUrl.provider.createSubscriptionCheckout({ ...request, planId: "agency" }),
    ).rejects.toMatchObject({ kind: "provider" });
  });

  it("opens the Customer Portal for a customer", async () => {
    const { provider, createPortal } = setup();

    const portal = await provider.createPortalSession({
      customerId: "cus_123",
      returnUrl: "https://app.example.com/billing",
      locale: "en",
    });

    expect(portal.url).toBe("https://billing.stripe.com/p/session/test");
    expect(createPortal).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://app.example.com/billing",
      locale: "en",
    });
  });

  it("requires keys", () => {
    expect(
      () =>
        new StripeBillingProvider({
          secretKey: "",
          webhookSecret: "whsec",
          catalog,
          managedPayments: true,
        }),
    ).toThrow(expect.objectContaining({ kind: "configuration" }));
    expect(
      () =>
        new StripeBillingProvider({
          secretKey: "sk_test",
          webhookSecret: "",
          catalog,
          managedPayments: true,
        }),
    ).toThrow(expect.objectContaining({ kind: "configuration" }));
  });
});

describe("StripeBillingProvider webhooks", () => {
  it("normalizes subscription changes with the plan from the catalog", async () => {
    const { provider } = setup();
    const { payload, signature } = await sign(
      stripeEvent("customer.subscription.updated", subscription({ cancel_at_period_end: true })),
    );

    await expect(provider.parseWebhook(payload, signature)).resolves.toEqual({
      type: "subscription.updated",
      eventId: "evt_test_1",
      subscription: {
        subscriptionId: "sub_123",
        customerId: "cus_123",
        workspaceId: "ws_1",
        status: "active",
        priceId: "price_starter",
        planId: "starter",
        currentPeriodEnd: new Date(1_790_000_000 * 1000),
        cancelAtPeriodEnd: true,
      },
    });
  });

  it("keeps unknown prices and statuses safe", async () => {
    const { provider } = setup();
    const unknown = subscription({
      status: "some_future_status",
      metadata: {},
      items: {
        object: "list",
        data: [
          {
            id: "si_1",
            object: "subscription_item",
            current_period_end: 1_790_000_000,
            price: { id: "price_retired", object: "price" },
          },
        ],
      },
    });
    const { payload, signature } = await sign(
      stripeEvent("customer.subscription.deleted", unknown),
    );

    const event = await provider.parseWebhook(payload, signature);

    expect(event.type).toBe("subscription.deleted");
    if (event.type !== "subscription.deleted") return;
    expect(event.subscription).toMatchObject({
      workspaceId: null,
      priceId: "price_retired",
      planId: null,
      status: "incomplete",
    });
    expect(hasAccess(event.subscription.status)).toBe(false);
  });

  it("identifies the workspace of a completed subscription checkout", async () => {
    const { provider } = setup();
    const { payload, signature } = await sign(
      stripeEvent("checkout.session.completed", {
        id: "cs_test_1",
        object: "checkout.session",
        mode: "subscription",
        client_reference_id: "ws_1",
        customer: "cus_123",
        subscription: "sub_123",
        payment_status: "paid",
        metadata: { workspaceId: "ws_1", planId: "starter" },
      }),
    );

    await expect(provider.parseWebhook(payload, signature)).resolves.toEqual({
      type: "checkout.completed",
      eventId: "evt_test_1",
      workspaceId: "ws_1",
      customerId: "cus_123",
      mode: "subscription",
      subscriptionId: "sub_123",
      paid: true,
      topUp: null,
    });
  });

  it("credits a top-up only once its payment has succeeded", async () => {
    const { provider } = setup();
    const session = {
      id: "cs_test_2",
      object: "checkout.session",
      mode: "payment",
      client_reference_id: "ws_1",
      customer: { id: "cus_123", object: "customer" },
      subscription: null,
      payment_status: "unpaid",
      metadata: { workspaceId: "ws_1", topUpId: "credits-5k", credits: "5000" },
    };

    const pending = await sign(stripeEvent("checkout.session.completed", session, "evt_1"));
    await expect(provider.parseWebhook(pending.payload, pending.signature)).resolves.toMatchObject({
      type: "checkout.completed",
      customerId: "cus_123",
      paid: false,
      topUp: { id: "credits-5k", credits: 5000 },
    });

    const settled = await sign(
      stripeEvent(
        "checkout.session.async_payment_succeeded",
        { ...session, payment_status: "paid" },
        "evt_2",
      ),
    );
    await expect(provider.parseWebhook(settled.payload, settled.signature)).resolves.toMatchObject({
      type: "checkout.completed",
      eventId: "evt_2",
      paid: true,
    });
  });

  it("reads the subscription of an invoice from its parent", async () => {
    const { provider } = setup();
    const invoice = {
      id: "in_123",
      object: "invoice",
      customer: "cus_123",
      amount_paid: 4900,
      currency: "usd",
      parent: {
        type: "subscription_details",
        subscription_details: { subscription: "sub_123", metadata: {} },
      },
    };

    const paid = await sign(stripeEvent("invoice.paid", invoice));
    await expect(provider.parseWebhook(paid.payload, paid.signature)).resolves.toEqual({
      type: "invoice.paid",
      eventId: "evt_test_1",
      invoiceId: "in_123",
      customerId: "cus_123",
      subscriptionId: "sub_123",
      amountPaid: 4900,
      currency: "usd",
    });

    const failed = await sign(stripeEvent("invoice.payment_failed", invoice, "evt_2"));
    await expect(provider.parseWebhook(failed.payload, failed.signature)).resolves.toEqual({
      type: "invoice.payment_failed",
      eventId: "evt_2",
      invoiceId: "in_123",
      customerId: "cus_123",
      subscriptionId: "sub_123",
    });
  });

  it("ignores events it does not act on", async () => {
    const { provider } = setup();
    const { payload, signature } = await sign(
      stripeEvent("customer.created", { id: "cus_123", object: "customer" }),
    );

    await expect(provider.parseWebhook(payload, signature)).resolves.toEqual({
      type: "ignored",
      eventId: "evt_test_1",
      providerType: "customer.created",
    });
  });

  it("rejects missing, forged, tampered and stale signatures", async () => {
    const { provider } = setup();
    const event = stripeEvent("customer.subscription.updated", subscription());
    const valid = await sign(event);
    const forged = await sign(event, { secret: "whsec_attacker" });
    const stale = await sign(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 });
    const tampered = valid.payload.replace('"ws_1"', '"ws_attacker"');

    for (const [payload, signature] of [
      [valid.payload, undefined],
      [forged.payload, forged.signature],
      [stale.payload, stale.signature],
      [tampered, valid.signature],
    ] as const) {
      await expect(provider.parseWebhook(payload, signature)).rejects.toMatchObject({
        kind: "invalid_signature",
      });
    }
  });

  it("accepts the raw body as bytes", async () => {
    const { provider } = setup();
    const { payload, signature } = await sign(
      stripeEvent("customer.subscription.created", subscription()),
    );

    const event = await provider.parseWebhook(new TextEncoder().encode(payload), signature);

    expect(event.type).toBe("subscription.updated");
  });
});

describe("hasAccess", () => {
  it("keeps access while a payment is retried and removes it afterwards", () => {
    expect(["trialing", "active", "past_due"].every((s) => hasAccess(s as never))).toBe(true);
    expect(
      ["unpaid", "canceled", "paused", "incomplete", "incomplete_expired"].some((s) =>
        hasAccess(s as never),
      ),
    ).toBe(false);
  });
});
