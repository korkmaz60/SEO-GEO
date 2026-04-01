"use client";

import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import type { FeedbackType } from "@/hooks/use-feedback";

const config: Record<FeedbackType, { icon: typeof CheckCircle2; className: string }> = {
  success: { icon: CheckCircle2, className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  error: { icon: XCircle, className: "bg-red-500/10 border-red-500/20 text-red-400" },
  info: { icon: Info, className: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
};

interface FeedbackBannerProps {
  type: FeedbackType;
  message: string;
  onClose?: () => void;
}

export function FeedbackBanner({ type, message, onClose }: FeedbackBannerProps) {
  const { icon: Icon, className } = config[type];
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${className}`}>
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onClose && (
        <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
