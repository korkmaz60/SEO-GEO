"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon: LucideIcon;
  suffix?: string;
  variant?: "default" | "geo" | "seo";
}

export function StatCard({ title, value, change, icon: Icon, suffix, variant = "default" }: StatCardProps) {
  const variantStyles = {
    default: "from-card to-card",
    geo: "from-geo/5 to-card border-geo/20",
    seo: "from-seo/5 to-card border-seo/20",
  };

  return (
    <Card className={`bg-gradient-to-br ${variantStyles[variant]} overflow-hidden`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {title}
            </p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums">{value}</span>
              {suffix && (
                <span className="text-sm text-muted-foreground">{suffix}</span>
              )}
            </div>
            {change !== undefined && (
              <div className="flex items-center gap-1">
                {change > 0 ? (
                  <TrendingUp className="size-3.5 text-success" />
                ) : change < 0 ? (
                  <TrendingDown className="size-3.5 text-destructive" />
                ) : (
                  <Minus className="size-3.5 text-muted-foreground" />
                )}
                <span
                  className={`text-xs font-medium ${
                    change > 0
                      ? "text-success"
                      : change < 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {change > 0 ? "+" : ""}
                  {change}%
                </span>
                <span className="text-xs text-muted-foreground">vs geçen ay</span>
              </div>
            )}
          </div>
          <div className={`rounded-lg p-2.5 ${
            variant === "geo"
              ? "bg-geo/10 text-geo"
              : variant === "seo"
                ? "bg-seo/10 text-seo"
                : "bg-primary/10 text-primary"
          }`}>
            <Icon className="size-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
