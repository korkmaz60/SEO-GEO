"use client";

import {
  AuditEntrySchema,
  WorkspaceRoleSchema,
  type AuditEntry,
  type Locale,
} from "@seo-geo/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiGet } from "@/lib/api";
import { formatDateTime, formatRelativeTime, formatUsd } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";

import { SettingsSection } from "./settings-section";

const PageSchema = z.object({ data: z.array(AuditEntrySchema), nextCursor: z.string().nullable() });

/** Audit actions with a localized label under `workspaceSettings.auditLog.actions`. */
const ACTION_LABELS = {
  "workspace.created": "workspaceCreated",
  "workspace.updated": "workspaceUpdated",
  "invitation.created": "invitationCreated",
  "invitation.canceled": "invitationCanceled",
  "member.joined": "memberJoined",
  "member.role_changed": "memberRoleChanged",
  "member.removed": "memberRemoved",
  "member.left": "memberLeft",
  "project.created": "projectCreated",
  "project.archived": "projectArchived",
  "project.restored": "projectRestored",
  "project.deleted": "projectDeleted",
  "credential.saved": "credentialSaved",
  "credential.deleted": "credentialDeleted",
  "budget.updated": "budgetUpdated",
  "budget.removed": "budgetRemoved",
} as const;

function actionLabelKey(action: string) {
  return Object.hasOwn(ACTION_LABELS, action)
    ? ACTION_LABELS[action as keyof typeof ACTION_LABELS]
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

export function AuditLog() {
  const t = useTranslations("workspaceSettings.auditLog");
  const tr = useTranslations("roles");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const { workspace } = useWorkspace();
  const log = useInfiniteQuery({
    queryKey: ["audit-log", workspace.id],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/audit-log?limit=50${pageParam ? `&before=${pageParam}` : ""}`,
        PageSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor,
  });

  const role = (value: unknown) => {
    const parsed = WorkspaceRoleSchema.safeParse(text(value).split(",")[0]);
    return parsed.success ? tr(parsed.data) : text(value);
  };

  /** A short human description of what the entry changed. */
  function detail(entry: AuditEntry): string {
    const m = entry.metadata;
    switch (entry.action) {
      case "workspace.created":
      case "workspace.updated":
        return `${text(m.name)} (/${text(m.slug)})`;
      case "invitation.created":
      case "member.joined":
        return `${text(m.email)} · ${role(m.role)}`;
      case "member.role_changed":
        return `${text(m.email)} · ${role(m.from)} → ${role(m.to)}`;
      case "project.created":
      case "project.archived":
      case "project.restored":
      case "project.deleted":
        return [text(m.name), text(m.domain)].filter(Boolean).join(" · ");
      case "credential.saved":
        return ["DataForSEO", text(m.login)].filter(Boolean).join(" · ");
      case "credential.deleted":
        return "DataForSEO";
      case "budget.updated":
        return typeof m.monthlyLimitUsd === "number"
          ? t("budgetDetail", { amount: formatUsd(m.monthlyLimitUsd, locale) })
          : "";
      default:
        return text(m.email);
    }
  }

  const entries = log.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <SettingsSection title={t("title")} description={t("description")}>
      {log.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : log.isError ? (
        <FormAlert message={te("generic")} />
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-36">{t("when")}</TableHead>
                <TableHead>{t("who")}</TableHead>
                <TableHead>{t("what")}</TableHead>
                <TableHead className="max-md:hidden">{t("ip")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    <Tooltip>
                      <TooltipTrigger render={<span className="cursor-default" />}>
                        {formatRelativeTime(new Date(entry.createdAt), locale)}
                      </TooltipTrigger>
                      <TooltipContent>{formatDateTime(entry.createdAt, locale)}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {entry.actor ? (
                      <span className="flex flex-col">
                        <span className="font-medium">{entry.actor.name}</span>
                        <span className="text-xs text-muted-foreground">{entry.actor.email}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{t("system")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col">
                      <span>
                        {(() => {
                          const key = actionLabelKey(entry.action);
                          return key ? t(`actions.${key}`) : entry.action;
                        })()}
                      </span>
                      <span className="text-xs text-muted-foreground">{detail(entry)}</span>
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground max-md:hidden">
                    {entry.ip ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {log.hasNextPage && (
            <Button
              variant="outline"
              className="self-center"
              disabled={log.isFetchingNextPage}
              onClick={() => log.fetchNextPage()}
            >
              {t("loadMore")}
            </Button>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
