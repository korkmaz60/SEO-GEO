"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";

const ranges = [
  { value: "7", label: "Son 7 gün" },
  { value: "14", label: "Son 14 gün" },
  { value: "28", label: "Son 28 gün" },
  { value: "90", label: "Son 90 gün" },
];

interface DateRangeSelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function DateRangeSelect({ value, onChange }: DateRangeSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v); }}>
      <SelectTrigger className="w-[160px] h-8 text-xs">
        <CalendarDays className="size-3.5 mr-1.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ranges.map((r) => (
          <SelectItem key={r.value} value={r.value} className="text-xs">
            {r.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
