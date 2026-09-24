import { z } from "zod";

import { BillingError } from "./errors.js";

const IdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{1,31}$/, "Use 2–32 lowercase letters, digits or -");

export const PlanLimitsSchema = z.strictObject({
  projects: z.int().positive(),
  trackedKeywords: z.int().nonnegative(),
  aiPrompts: z.int().nonnegative(),
  members: z.int().positive(),
  /** Credits added at the start of every billing period. */
  monthlyCredits: z.int().nonnegative(),
});

export const PlanSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Provider price of the recurring subscription, e.g. a Stripe `price_…` ID. */
  priceId: z.string().min(1),
  limits: PlanLimitsSchema,
});

export const TopUpSchema = z.strictObject({
  id: IdSchema,
  name: z.string().min(1),
  /** Provider price of the one-off payment. */
  priceId: z.string().min(1),
  credits: z.int().positive(),
});

export const BillingCatalogSchema = z
  .strictObject({
    plans: z.array(PlanSchema).min(1),
    topUps: z.array(TopUpSchema).default([]),
  })
  .superRefine((catalog, ctx) => {
    const ids = new Set<string>();
    const prices = new Set<string>();
    const entries = [
      ...catalog.plans.map((item, index) => ({ item, path: ["plans", index] })),
      ...catalog.topUps.map((item, index) => ({ item, path: ["topUps", index] })),
    ];
    for (const { item, path } of entries) {
      if (ids.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate id "${item.id}"`,
          path: [...path, "id"],
        });
      }
      if (prices.has(item.priceId)) {
        ctx.addIssue({
          code: "custom",
          message: `Price "${item.priceId}" is used twice`,
          path: [...path, "priceId"],
        });
      }
      ids.add(item.id);
      prices.add(item.priceId);
    }
  });

export type PlanLimits = z.infer<typeof PlanLimitsSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type TopUp = z.infer<typeof TopUpSchema>;
export type BillingCatalogInput = z.input<typeof BillingCatalogSchema>;

/**
 * Plans and credit top-ups sold in the cloud edition, with the provider prices behind them.
 * Loaded from deployment configuration; prices themselves are created in the provider's
 * dashboard.
 */
export class BillingCatalog {
  readonly plans: readonly Plan[];
  readonly topUps: readonly TopUp[];
  private readonly plansByPrice: ReadonlyMap<string, Plan>;

  private constructor(plans: Plan[], topUps: TopUp[]) {
    this.plans = plans;
    this.topUps = topUps;
    this.plansByPrice = new Map(plans.map((plan) => [plan.priceId, plan]));
  }

  static parse(input: unknown): BillingCatalog {
    const result = BillingCatalogSchema.safeParse(input);
    if (!result.success) {
      const details = z.prettifyError(result.error);
      throw new BillingError("configuration", `Invalid billing catalog:\n${details}`, {
        cause: result.error,
      });
    }
    return new BillingCatalog(result.data.plans, result.data.topUps);
  }

  plan(id: string): Plan {
    const plan = this.plans.find((candidate) => candidate.id === id);
    if (!plan) throw new BillingError("unknown_plan", `Unknown plan "${id}"`);
    return plan;
  }

  topUp(id: string): TopUp {
    const topUp = this.topUps.find((candidate) => candidate.id === id);
    if (!topUp) throw new BillingError("unknown_top_up", `Unknown credit top-up "${id}"`);
    return topUp;
  }

  /** The plan sold at this price, or `undefined` for prices outside the catalog. */
  planForPrice(priceId: string): Plan | undefined {
    return this.plansByPrice.get(priceId);
  }
}
