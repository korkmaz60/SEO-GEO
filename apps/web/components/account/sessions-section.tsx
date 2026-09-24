"use client";

import type { Locale } from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Smartphone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { formatRelativeTime } from "@/lib/format";

/** "Chrome · macOS" from a user agent; good enough to recognize one's own devices. */
export function describeUserAgent(userAgent: string | null | undefined): {
  label: string;
  mobile: boolean;
} {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  return {
    label: [browser, os].filter(Boolean).join(" · "),
    mobile: /Mobile|Android|iPhone/.test(ua),
  };
}

const queryKey = ["sessions"];

export function SessionsSection() {
  const t = useTranslations("account.sessions");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey,
    queryFn: async () => {
      const [list, current] = await Promise.all([
        authClient.listSessions(),
        authClient.getSession(),
      ]);
      if (list.error || !list.data) throw list.error ?? new Error("Empty response");
      const currentId = current.data?.session.id;
      return list.data
        .map((session) => ({ ...session, current: session.id === currentId }))
        .sort(
          (a, b) =>
            Number(b.current) - Number(a.current) ||
            +new Date(b.updatedAt) - +new Date(a.updatedAt),
        );
    },
  });

  async function revoke(token: string) {
    const { error } = await authClient.revokeSession({ token });
    if (error) throw new Error(te(authErrorKey(error)));
    await queryClient.invalidateQueries({ queryKey });
  }

  async function revokeOthers() {
    const { error } = await authClient.revokeOtherSessions();
    if (error) throw new Error(te(authErrorKey(error)));
    await queryClient.invalidateQueries({ queryKey });
    toast.success(t("revokedOthers"));
  }

  const others = sessions.data?.filter((session) => !session.current).length ?? 0;

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      footer={
        others > 0 && (
          <ConfirmDialog
            trigger={<Button variant="outline">{t("revokeOthers")}</Button>}
            title={t("revokeOthersTitle")}
            description={t("revokeOthersBody", { count: others })}
            confirmLabel={t("revokeOthers")}
            onConfirm={revokeOthers}
          />
        )
      }
    >
      {sessions.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : sessions.isError ? (
        <FormAlert message={te("generic")} />
      ) : (
        <ul className="flex flex-col divide-y">
          {sessions.data.map((session) => {
            const device = describeUserAgent(session.userAgent);
            const Icon = device.mobile ? Smartphone : Laptop;
            return (
              <li key={session.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 font-medium">
                    {device.label || t("unknownDevice")}
                    {session.current && <Badge variant="secondary">{t("current")}</Badge>}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      session.ipAddress,
                      t("lastActive", {
                        when: formatRelativeTime(new Date(session.updatedAt), locale),
                      }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {!session.current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      revoke(session.token).catch((error: Error) => toast.error(error.message))
                    }
                  >
                    {t("revoke")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
