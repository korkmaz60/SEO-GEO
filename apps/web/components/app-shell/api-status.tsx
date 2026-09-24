"use client";

import { HealthResponseSchema } from "@seo-geo/contracts";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Shows whether the web app can reach the NestJS api through the /api proxy. */
export function ApiStatus({ className }: { className?: string }) {
  const t = useTranslations("shell.api");
  const { data, isPending, isError } = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => apiGet("/health", HealthResponseSchema, { signal }),
    refetchInterval: 60_000,
  });

  const state = isPending ? "checking" : isError ? "offline" : "online";
  const label = state === "online" && data ? t("online", { version: data.version }) : t(state);

  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          state === "online" && "bg-success",
          state === "offline" && "bg-critical",
          state === "checking" && "animate-pulse bg-muted-foreground",
        )}
      />
      <span className="truncate" role="status">
        {label}
      </span>
    </div>
  );
}
