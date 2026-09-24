"use client";

import type { IssueSeverity } from "@seo-geo/contracts";
import { CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export const SEVERITY_STYLE: Record<IssueSeverity, { icon: LucideIcon; className: string }> = {
  ERROR: { icon: CircleX, className: "text-critical" },
  WARNING: { icon: TriangleAlert, className: "text-warning" },
  NOTICE: { icon: Info, className: "text-muted-foreground" },
};

/** Severity as icon plus label: status is never shown by color alone. */
export function SeverityIcon({
  severity,
  withLabel = false,
}: {
  severity: IssueSeverity;
  withLabel?: boolean;
}) {
  const t = useTranslations("siteAudit.severity");
  const { icon: Icon, className } = SEVERITY_STYLE[severity];
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon className="size-4 shrink-0" aria-hidden />
      {withLabel ? (
        <span className="text-sm font-medium">{t(severity)}</span>
      ) : (
        <span className="sr-only">{t(severity)}</span>
      )}
    </span>
  );
}
