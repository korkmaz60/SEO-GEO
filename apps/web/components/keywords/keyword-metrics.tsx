"use client";

import type { SearchIntent } from "@seo-geo/contracts";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DIFFICULTY_LEVELS = [
  { max: 29, key: "easy", dot: "bg-success" },
  { max: 49, key: "medium", dot: "bg-warning" },
  { max: 69, key: "hard", dot: "bg-serious" },
  { max: 100, key: "veryHard", dot: "bg-critical" },
] as const;

/** Keyword difficulty (0–100) with its level as text, not color alone. */
export function Difficulty({ value }: { value: number | null }) {
  const t = useTranslations("keywordMetrics.difficulty");
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const rounded = Math.round(value);
  const level = DIFFICULTY_LEVELS.find((entry) => rounded <= entry.max) ?? DIFFICULTY_LEVELS[3];
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums" title={t(level.key)}>
      <span className={cn("size-2 rounded-full", level.dot)} aria-hidden />
      {rounded}
      <span className="sr-only">{t(level.key)}</span>
    </span>
  );
}

export function IntentBadge({ intent }: { intent: SearchIntent | null }) {
  const t = useTranslations("keywordMetrics.intents");
  if (!intent) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className="font-normal">
      {t(intent)}
    </Badge>
  );
}
