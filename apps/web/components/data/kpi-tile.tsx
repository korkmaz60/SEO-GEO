import { Info, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Delta } from "@/lib/format";

import { DeltaBadge } from "./delta-badge";

export interface MetricProvenance {
  source: string;
  method?: string;
  updatedAt?: string;
}

interface KpiTileProps {
  label: string;
  icon?: LucideIcon;
  /** Formatted value; `null` means no data (never shown as zero). */
  value: string | null;
  emptyLabel: string;
  delta?: { delta: Delta; label: string } | null;
  provenance?: MetricProvenance & { labels: { source: string; method: string; updated: string } };
}

export function KpiTile({ label, icon: Icon, value, emptyLabel, delta, provenance }: KpiTileProps) {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
        <span className="line-clamp-2 leading-snug">{label}</span>
        {provenance && (
          <Tooltip>
            <TooltipTrigger
              className="mt-0.5 ml-auto shrink-0 text-muted-foreground/70 hover:text-foreground"
              aria-label={provenance.labels.source}
            >
              <Info className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent className="space-y-0.5 text-xs">
              <p>
                {provenance.labels.source}: {provenance.source}
              </p>
              {provenance.method && (
                <p>
                  {provenance.labels.method}: {provenance.method}
                </p>
              )}
              {provenance.updatedAt && (
                <p>
                  {provenance.labels.updated}: {provenance.updatedAt}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {value === null ? (
        <div>
          <p className="text-2xl font-semibold text-muted-foreground/60" aria-hidden>
            —
          </p>
          <p className="text-xs text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : (
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-semibold tracking-tight">{value}</p>
          {delta && <DeltaBadge delta={delta.delta} label={delta.label} />}
        </div>
      )}
    </Card>
  );
}
