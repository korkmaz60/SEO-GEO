import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import type { Delta } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A change versus the previous period. `trend` already accounts for "lower is better"
 * metrics such as rankings, so `up` always means improvement.
 */
export function DeltaBadge({ delta, label }: { delta: Delta; label: string }) {
  const Icon =
    delta.trend === "up" ? ArrowUpRight : delta.trend === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        delta.trend === "up" && "text-positive",
        delta.trend === "down" && "text-negative",
        delta.trend === "flat" && "text-muted-foreground",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
