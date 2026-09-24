/** The categorical chart color of a brand's slot (1 = own brand), see globals.css. */
export function slotColor(slot: number): string {
  return `var(--chart-${Math.min(Math.max(slot, 1), 8)})`;
}
