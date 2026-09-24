"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

interface Alert {
  type: string;
  message: string;
  time: string;
}

const alertConfig: Record<string, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: "text-success bg-success/10" },
  warning: { icon: AlertTriangle, className: "text-warning bg-warning/10" },
  info: { icon: Info, className: "text-primary bg-primary/10" },
  error: { icon: XCircle, className: "text-destructive bg-destructive/10" },
};

interface RecentAlertsProps {
  data?: Alert[];
}

export function RecentAlerts({ data }: RecentAlertsProps) {
  const alerts = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Son Bildirimler</CardTitle>
        <p className="text-xs text-muted-foreground">Önemli değişiklikler ve uyarılar</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Bildirim yok</p>
        ) : (
          alerts.map((alert, idx) => {
            const config = alertConfig[alert.type] || alertConfig.info;
            const Icon = config.icon;
            return (
              <div key={idx} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
                <div className={`rounded-md p-1.5 shrink-0 ${config.className}`}>
                  <Icon className="size-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{alert.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{alert.time}</p>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
