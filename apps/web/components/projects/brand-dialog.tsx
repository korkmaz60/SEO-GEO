"use client";

import type { BrandEntity } from "@seo-geo/contracts";
import { useTranslations } from "next-intl";
import { useState, type FormEvent, type ReactElement } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";

export interface BrandInput {
  name: string;
  domains: string[];
  aliases: string[];
}

function splitList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

/** Adds a competitor or edits a brand's name, domains and aliases. */
export function BrandDialog({
  trigger,
  brand,
  title,
  onSave,
}: {
  trigger: ReactElement;
  brand?: BrandEntity;
  title: string;
  /** Throws `ApiError` with field errors to show them in the form. */
  onSave: (input: BrandInput) => Promise<void>;
}) {
  const t = useTranslations("projectSettings.brands");
  const te = useTranslations("errors");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domainError, setDomainError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    setDomainError(false);
    try {
      await onSave({
        name: String(form.get("name")).trim(),
        domains: splitList(String(form.get("domains"))),
        aliases: splitList(String(form.get("aliases"))),
      });
      setOpen(false);
    } catch (caught) {
      const fields = caught instanceof ApiError ? Object.keys(caught.fieldErrors) : [];
      if (fields.some((path) => path.startsWith("domains"))) setDomainError(true);
      else
        setError(
          caught instanceof ApiError && caught.status === 409 ? t("limitReached") : te("generic"),
        );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
        setDomainError(false);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="brand-name">{t("name")}</FieldLabel>
              <Input
                id="brand-name"
                name="name"
                defaultValue={brand?.name}
                maxLength={80}
                required
              />
            </Field>
            <Field data-invalid={domainError ? true : undefined}>
              <FieldLabel htmlFor="brand-domains">{t("domains")}</FieldLabel>
              <Input
                id="brand-domains"
                name="domains"
                defaultValue={brand?.domains.join(", ")}
                placeholder="ornek.com, ornek.com.tr"
                aria-invalid={domainError ? true : undefined}
                required
              />
              <FieldDescription>{t("domainsHint")}</FieldDescription>
              <FieldError>{domainError ? t("invalidDomain") : null}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="brand-aliases">{t("aliases")}</FieldLabel>
              <Input
                id="brand-aliases"
                name="aliases"
                defaultValue={brand?.aliases.join(", ")}
                placeholder={t("aliasesPlaceholder")}
              />
              <FieldDescription>{t("aliasesHint")}</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
