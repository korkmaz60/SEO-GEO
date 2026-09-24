"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { toSlug } from "@/lib/slug";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { SettingsSection } from "./settings-section";

const SLUG_ERRORS = new Set([
  "INVALID_SLUG",
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
]);

export function WorkspaceGeneralSettings() {
  const t = useTranslations("workspaceSettings.general");
  const te = useTranslations("errors");
  const router = useRouter();
  const { workspace } = useWorkspace();
  const canEdit = useCan("admin");
  const isOwner = workspace.role === "owner";
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const changed = name.trim() !== workspace.name || slug !== workspace.slug;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSlugError(null);
    const { error } = await authClient.organization.update({
      organizationId: workspace.id,
      data: {
        name: name.trim(),
        ...(slug !== workspace.slug ? { slug } : {}),
      },
    });
    setPending(false);
    if (error) {
      const message = te(authErrorKey(error));
      if (error.code && SLUG_ERRORS.has(error.code)) setSlugError(message);
      else setError(message);
      return;
    }
    toast.success(t("saved"));
    if (slug !== workspace.slug) router.replace(`/${slug}/settings`);
    router.refresh();
  }

  async function remove() {
    const { error } = await authClient.organization.delete({ organizationId: workspace.id });
    if (error) throw new Error(te(authErrorKey(error)));
    router.push("/");
    router.refresh();
  }

  async function leave() {
    const { error } = await authClient.organization.leave({ organizationId: workspace.id });
    if (error) throw new Error(te(authErrorKey(error)));
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title={t("title")}
        description={t("description")}
        onSubmit={canEdit ? save : undefined}
        footer={
          canEdit && (
            <Button type="submit" disabled={pending || !changed || !slug || !name.trim()}>
              {t("save")}
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <FormAlert message={error} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="workspace-name">{t("name")}</FieldLabel>
              <Input
                id="workspace-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                disabled={!canEdit}
                required
              />
            </Field>
            <Field data-invalid={slugError ? true : undefined}>
              <FieldLabel htmlFor="workspace-slug">{t("slug")}</FieldLabel>
              <Input
                id="workspace-slug"
                value={slug}
                onChange={(event) => setSlug(toSlug(event.target.value))}
                className="font-mono"
                disabled={!canEdit}
                aria-invalid={slugError ? true : undefined}
                required
              />
              <FieldDescription>{t("slugHint")}</FieldDescription>
              <FieldError>{slugError}</FieldError>
            </Field>
          </FieldGroup>
        </div>
      </SettingsSection>

      <SettingsSection
        tone="danger"
        title={t("dangerTitle")}
        description={isOwner ? t("deleteDescription") : t("leaveDescription")}
        footer={
          isOwner ? (
            <ConfirmDialog
              trigger={<Button variant="destructive">{t("delete")}</Button>}
              title={t("deleteConfirmTitle", { workspace: workspace.name })}
              description={t("deleteConfirmBody")}
              confirmLabel={t("delete")}
              confirmText={workspace.slug}
              onConfirm={remove}
            />
          ) : (
            <ConfirmDialog
              trigger={<Button variant="destructive">{t("leave")}</Button>}
              title={t("leaveConfirmTitle", { workspace: workspace.name })}
              description={t("leaveConfirmBody")}
              confirmLabel={t("leave")}
              onConfirm={leave}
            />
          )
        }
      />
    </div>
  );
}
