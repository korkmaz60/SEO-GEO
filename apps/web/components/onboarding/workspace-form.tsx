"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";
import { toSlug } from "@/lib/slug";

export interface CreatedWorkspace {
  id: string;
  name: string;
  slug: string;
}

const SLUG_ERRORS = new Set([
  "INVALID_SLUG",
  "ORGANIZATION_ALREADY_EXISTS",
  "ORGANIZATION_SLUG_ALREADY_TAKEN",
]);

export function WorkspaceForm({ onCreated }: { onCreated: (workspace: CreatedWorkspace) => void }) {
  const t = useTranslations("setup.workspace");
  const te = useTranslations("errors");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSlugError(null);
    const { data, error } = await authClient.organization.create({ name: name.trim(), slug });
    if (error || !data) {
      setPending(false);
      const message = te(authErrorKey(error));
      if (error?.code && SLUG_ERRORS.has(error.code)) setSlugError(message);
      else setError(message);
      return;
    }
    onCreated({ id: data.id, name: data.name, slug: data.slug });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormAlert message={error} />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="workspace-name">{t("name")}</FieldLabel>
          <Input
            id="workspace-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugEdited) setSlug(toSlug(event.target.value));
            }}
            placeholder={t("namePlaceholder")}
            required
            maxLength={80}
            autoFocus
          />
          <FieldDescription>{t("nameHint")}</FieldDescription>
        </Field>
        <Field data-invalid={slugError ? true : undefined}>
          <FieldLabel htmlFor="workspace-slug">{t("slug")}</FieldLabel>
          <Input
            id="workspace-slug"
            value={slug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(toSlug(event.target.value));
            }}
            className="font-mono"
            required
            aria-invalid={slugError ? true : undefined}
          />
          <FieldDescription>{t("slugHint", { slug: slug || "…" })}</FieldDescription>
          <FieldError>{slugError}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending || !slug}>
        {t("submit")}
      </Button>
    </form>
  );
}
