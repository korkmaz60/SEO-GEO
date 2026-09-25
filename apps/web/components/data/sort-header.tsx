"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface SortState<K extends string> {
  key: K;
  direction: 1 | -1;
}

/** Clicking the sorted column flips it; another column starts in its natural direction. */
export function nextSort<K extends string>(
  previous: SortState<K>,
  key: K,
  initialDirection: (key: K) => 1 | -1,
): SortState<K> {
  return previous.key === key
    ? { key, direction: previous.direction === 1 ? -1 : 1 }
    : { key, direction: initialDirection(key) };
}

/** Orders two values with missing ones (`null`) last, whatever the direction. */
export function compareValues(
  left: number | string | null,
  right: number | string | null,
  direction: 1 | -1,
  locale: string,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const order =
    typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right, locale)
      : Number(left) - Number(right);
  return order * direction;
}

/** A table column header that sorts by its column, announced with `aria-sort`. */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.direction === 1 ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sort.direction === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </button>
    </TableHead>
  );
}
