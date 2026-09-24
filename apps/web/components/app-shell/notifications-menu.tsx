"use client";

import { NotificationSchema, type Locale, type Notification } from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiGet, apiSend } from "@/lib/api";
import { formatRelativeTime, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace-context";

const NotificationListSchema = z.object({
  data: z.array(NotificationSchema),
  unread: z.int(),
});

type Translate = ReturnType<typeof useTranslations<"shell.notifications">>;

/** Localized text and destination for a notification; unknown types use the api's text. */
function describe(notification: Notification, t: Translate, locale: Locale, workspaceSlug: string) {
  const { data } = notification;
  switch (notification.type) {
    case "budget.threshold":
      return {
        title: t("types.budgetThreshold.title", { percent: Number(data.percent ?? 0) }),
        body: t("types.budgetThreshold.body", {
          spent: formatUsd(Number(data.spentUsd ?? 0), locale),
          limit: formatUsd(Number(data.limitUsd ?? 0), locale),
        }),
        href: `/${workspaceSlug}/settings/usage`,
      };
    case "credential.invalid":
      return {
        title: t("types.credentialInvalid.title"),
        body: t("types.credentialInvalid.body"),
        href: `/${workspaceSlug}/settings/providers`,
      };
    case "rank.budget_blocked":
      return {
        title: t("types.rankBudgetBlocked.title"),
        body: t("types.rankBudgetBlocked.body", {
          project: String(data.project ?? ""),
          limit: formatUsd(Number(data.limitUsd ?? 0), locale),
        }),
        href: `/${workspaceSlug}/settings/usage`,
      };
    case "dataforseo.account_blocked":
      return {
        title: t("types.dataforseoBlocked.title"),
        body: t("types.dataforseoBlocked.body", { code: String(data.code ?? "") }),
        href: `/${workspaceSlug}/settings/providers`,
      };
    case "google.revoked":
      return {
        title: t("types.googleRevoked.title"),
        body: t("types.googleRevoked.body", { email: String(data.email ?? "") }),
        href: `/${workspaceSlug}/settings/providers`,
      };
    default:
      return { title: notification.title, body: notification.body, href: notification.link };
  }
}

export function NotificationsMenu() {
  const t = useTranslations("shell.notifications");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const queryKey = ["notifications", workspace.id];
  const { data } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiGet(`/workspaces/${workspace.id}/notifications`, NotificationListSchema, { signal }),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) =>
      apiSend("POST", `/workspaces/${workspace.id}/notifications/${id}/read`),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  const markAllRead = useMutation({
    mutationFn: () => apiSend("POST", `/workspaces/${workspace.id}/notifications/read-all`),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const notifications = data?.data ?? [];
  const unread = data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            aria-label={unread > 0 ? t("labelUnread", { count: unread }) : t("label")}
          />
        }
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground tabular-nums"
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <PopoverHeader className="flex-row items-center justify-between border-b px-3 py-2.5">
          <PopoverTitle>{t("title")}</PopoverTitle>
          {unread > 0 && (
            <Button
              variant="link"
              size="xs"
              className="h-auto px-0"
              onClick={() => markAllRead.mutate()}
            >
              {t("markAllRead")}
            </Button>
          )}
        </PopoverHeader>
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
            <BellOff className="size-5" aria-hidden />
            {t("empty")}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <ul className="flex flex-col py-1">
              {notifications.map((notification) => {
                const text = describe(notification, t, locale, workspace.slug);
                const isUnread = notification.readAt === null;
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className="flex w-full gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                      onClick={() => {
                        if (isUnread) markRead.mutate(notification.id);
                        if (text.href) {
                          setOpen(false);
                          router.push(text.href);
                        }
                      }}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          isUnread ? "bg-primary" : "bg-transparent",
                        )}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className={cn("text-sm", isUnread && "font-medium")}>
                          {text.title}
                        </span>
                        {text.body && (
                          <span className="text-xs text-muted-foreground">{text.body}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeTime(new Date(notification.createdAt), locale)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
