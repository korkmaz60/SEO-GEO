"use client";

import { WORKSPACE_ROLE_ORDER, type WorkspaceRole } from "@seo-geo/contracts";
import { useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Role picker; `assignable` limits the options to roles the current user may grant. */
export function RoleSelect({
  value,
  onChange,
  assignable,
  disabled,
  size = "default",
  id,
}: {
  value: WorkspaceRole;
  onChange: (role: WorkspaceRole) => void;
  assignable: readonly WorkspaceRole[];
  disabled?: boolean;
  size?: "sm" | "default";
  id?: string;
}) {
  const t = useTranslations("roles");
  const td = useTranslations("workspaceSettings.members.roleDescriptions");
  const options = WORKSPACE_ROLE_ORDER.filter(
    (role) => assignable.includes(role) || role === value,
  );
  const items = options.map((role) => ({ value: role, label: t(role) }));

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => next && onChange(next as WorkspaceRole)}
      disabled={disabled}
    >
      <SelectTrigger id={id} size={size} className="min-w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="max-w-72">
        {options.map((role) => (
          <SelectItem key={role} value={role} disabled={!assignable.includes(role)}>
            <span className="flex flex-col gap-0.5 whitespace-normal">
              <span>{t(role)}</span>
              <span className="text-xs text-muted-foreground">{td(role)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Roles a member with `role` may grant: owners grant any role, admins up to admin. */
export function assignableRoles(role: WorkspaceRole): readonly WorkspaceRole[] {
  if (role === "owner") return WORKSPACE_ROLE_ORDER;
  if (role === "admin") return ["admin", "member", "viewer"];
  return [];
}
