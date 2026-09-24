/** Serialization helpers shared by the response mappers. */

export function iso(date: Date): string;
export function iso(date: Date | null): string | null;
export function iso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

/** Prisma decimals (money) as JSON numbers. Sums are computed exactly in the database. */
export function money(value: { toNumber(): number }): number;
export function money(value: { toNumber(): number } | null): number | null;
export function money(value: { toNumber(): number } | null): number | null {
  return value ? value.toNumber() : null;
}
