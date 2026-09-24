"use client";

import {
  InstanceInfoSchema,
  WorkspaceRoleSchema,
  type Locale,
  type WorkspaceRole,
} from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MailPlus, UserMinus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { UserAvatar } from "@/components/app-shell/nav-user";
import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { authErrorKey, type AuthClientError } from "@/lib/auth-errors";
import { formatDate } from "@/lib/format";
import { useWorkspace } from "@/lib/workspace-context";

import { RoleSelect, assignableRoles } from "./role-select";
import { SettingsSection } from "./settings-section";

function parseRole(role: string): WorkspaceRole {
  const parsed = WorkspaceRoleSchema.safeParse(role.split(",")[0]);
  return parsed.success ? parsed.data : "viewer";
}

/** Unwraps a Better Auth client result, throwing its error for react-query. */
function unwrap<T>(result: { data: T | null; error: AuthClientError | null }): T {
  if (result.error || result.data === null) throw result.error ?? new Error("Empty response");
  return result.data;
}

export function MembersSettings() {
  const t = useTranslations("workspaceSettings.members");
  const tr = useTranslations("roles");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const { workspace, user } = useWorkspace();
  const canManage = workspace.role === "owner" || workspace.role === "admin";
  const assignable = assignableRoles(workspace.role);
  const membersKey = ["members", workspace.id];
  const invitationsKey = ["invitations", workspace.id];

  const instance = useQuery({
    queryKey: ["instance"],
    queryFn: ({ signal }) => apiGet("/instance", InstanceInfoSchema, { signal }),
    staleTime: Infinity,
  });
  const members = useQuery({
    queryKey: membersKey,
    queryFn: async () =>
      unwrap(
        await authClient.organization.listMembers({
          query: { organizationId: workspace.id, limit: 500 },
        }),
      ).members,
  });
  const invitations = useQuery({
    queryKey: invitationsKey,
    enabled: canManage,
    queryFn: async () =>
      unwrap(
        await authClient.organization.listInvitations({ query: { organizationId: workspace.id } }),
      ).filter((invitation) => invitation.status === "pending"),
  });

  const failed = (error: unknown) => toast.error(te(authErrorKey(error as AuthClientError)));
  const updateRole = useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: WorkspaceRole }) =>
      unwrap(
        await authClient.organization.updateMemberRole({
          memberId,
          role,
          organizationId: workspace.id,
        }),
      ),
    onSuccess: () => toast.success(t("roleUpdated")),
    onError: failed,
    onSettled: () => queryClient.invalidateQueries({ queryKey: membersKey }),
  });
  const cancelInvitation = useMutation({
    mutationFn: async (invitationId: string) =>
      unwrap(await authClient.organization.cancelInvitation({ invitationId })),
    onError: failed,
    onSettled: () => queryClient.invalidateQueries({ queryKey: invitationsKey }),
  });

  async function removeMember(memberId: string) {
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: memberId,
      organizationId: workspace.id,
    });
    if (error) throw new Error(te(authErrorKey(error)));
    await queryClient.invalidateQueries({ queryKey: membersKey });
    toast.success(t("removed"));
  }

  async function copyInvitationLink(invitationId: string) {
    await navigator.clipboard.writeText(`${window.location.origin}/invite/${invitationId}`);
    toast.success(t("linkCopied"));
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <InviteForm
          assignable={assignable}
          emailDelivery={instance.data?.emailDelivery ?? true}
          onInvited={() => queryClient.invalidateQueries({ queryKey: invitationsKey })}
        />
      )}

      <SettingsSection
        title={t("title")}
        description={t("description", { count: members.data?.length ?? 0 })}
      >
        {members.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : members.isError ? (
          <FormAlert message={te("generic")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("member")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead className="max-sm:hidden">{t("joined")}</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.data.map((member) => {
                const role = parseRole(member.role);
                const isSelf = member.userId === user.id;
                // Admins cannot change or remove owners; nobody edits their own role here.
                const editable = canManage && !isSelf && assignable.includes(role);
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          user={{
                            ...user,
                            name: member.user.name,
                            image: member.user.image ?? null,
                          }}
                        />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {member.user.name}
                            {isSelf && (
                              <span className="font-normal text-muted-foreground"> {t("you")}</span>
                            )}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {member.user.email}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {editable ? (
                        <RoleSelect
                          size="sm"
                          value={role}
                          assignable={assignable}
                          disabled={updateRole.isPending}
                          onChange={(next) =>
                            next !== role && updateRole.mutate({ memberId: member.id, role: next })
                          }
                        />
                      ) : (
                        <Badge variant={role === "owner" ? "default" : "secondary"}>
                          {tr(role)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-sm:hidden">
                      {formatDate(member.createdAt, locale)}
                    </TableCell>
                    <TableCell>
                      {editable && (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={t("remove")}>
                              <UserMinus />
                            </Button>
                          }
                          title={t("removeTitle", { name: member.user.name })}
                          description={t("removeBody", { workspace: workspace.name })}
                          confirmLabel={t("remove")}
                          onConfirm={() => removeMember(member.id)}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SettingsSection>

      {canManage && (invitations.data?.length ?? 0) > 0 && (
        <SettingsSection title={t("pendingTitle")} description={t("pendingDescription")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("email")}</TableHead>
                <TableHead>{t("role")}</TableHead>
                <TableHead className="max-sm:hidden">{t("expires")}</TableHead>
                <TableHead className="w-20">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.data?.map((invitation) => (
                <TableRow key={invitation.id}>
                  <TableCell className="font-medium">{invitation.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{tr(parseRole(invitation.role))}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-sm:hidden">
                    {formatDate(invitation.expiresAt, locale)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("copyLink")}
                        onClick={() => copyInvitationLink(invitation.id)}
                      >
                        <Copy />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("cancelInvitation")}
                        disabled={cancelInvitation.isPending}
                        onClick={() => cancelInvitation.mutate(invitation.id)}
                      >
                        <X />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SettingsSection>
      )}
    </div>
  );
}

function InviteForm({
  assignable,
  emailDelivery,
  onInvited,
}: {
  assignable: readonly WorkspaceRole[];
  emailDelivery: boolean;
  onInvited: () => void;
}) {
  const t = useTranslations("workspaceSettings.members");
  const te = useTranslations("errors");
  const { workspace } = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { data, error } = await authClient.organization.inviteMember({
      email: email.trim(),
      role,
      organizationId: workspace.id,
    });
    setPending(false);
    if (error || !data) {
      setError(te(authErrorKey(error)));
      return;
    }
    setEmail("");
    onInvited();
    if (emailDelivery) {
      toast.success(t("invited", { email: data.email }));
    } else {
      await navigator.clipboard
        .writeText(`${window.location.origin}/invite/${data.id}`)
        .catch(() => undefined);
      toast.success(t("invitedNoEmail", { email: data.email }));
    }
  }

  return (
    <SettingsSection
      title={t("inviteTitle")}
      description={emailDelivery ? t("inviteDescription") : t("inviteDescriptionNoEmail")}
      onSubmit={invite}
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field className="flex-1">
            <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ad@sirket.com"
              required
            />
          </Field>
          <Field className="sm:w-auto">
            <FieldLabel htmlFor="invite-role">{t("role")}</FieldLabel>
            <RoleSelect id="invite-role" value={role} onChange={setRole} assignable={assignable} />
          </Field>
          <Button type="submit" disabled={pending || !email.trim()}>
            <MailPlus data-icon="inline-start" />
            {t("invite")}
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
