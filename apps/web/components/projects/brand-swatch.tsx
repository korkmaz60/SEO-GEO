import { cn } from "@/lib/utils";

/** Static class names so Tailwind generates them; index = chart slot − 1. */
const SLOT_CLASSES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-4",
  "bg-chart-5",
  "bg-chart-6",
  "bg-chart-7",
  "bg-chart-8",
] as const;

/** The categorical chart color a brand keeps in every chart. */
export function BrandSwatch({ slot, className }: { slot: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        SLOT_CLASSES[slot - 1] ?? "bg-muted",
        className,
      )}
    />
  );
}
