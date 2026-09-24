"use client";

import { ProjectDetailSchema, type Locale, type ProjectDetail } from "@seo-geo/contracts";
import { Plus, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, apiSend, errorMessage } from "@/lib/api";
import { MARKETS } from "@/lib/locations";

const MAX_ONBOARDING_COMPETITORS = 3;

interface CompetitorRow {
  key: number;
  name: string;
  domain: string;
}

export function ProjectForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: (project: ProjectDetail) => void;
}) {
  const t = useTranslations("setup.project");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const [market, setMarket] = useState(String(locale === "tr" ? 2792 : 2840));
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = MARKETS.find((item) => String(item.locationCode) === market) ?? MARKETS[0];
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const project = await apiSend(
        "POST",
        `/workspaces/${workspaceId}/projects`,
        {
          name: String(form.get("name")).trim(),
          domain: String(form.get("domain")).trim(),
          locationCode: selected?.locationCode,
          languageCode: selected?.languageCode,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          competitors: competitors
            .filter((row) => row.domain.trim())
            .map((row) => ({
              name: row.name.trim() || row.domain.trim(),
              domains: [row.domain.trim()],
            })),
        },
        ProjectDetailSchema,
      );
      onCreated(project);
    } catch (caught) {
      setPending(false);
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setFieldErrors(caught.fieldErrors);
      } else {
        setError(errorMessage(caught, te("generic")));
      }
    }
  }

  const marketItems = MARKETS.map((item) => ({
    value: String(item.locationCode),
    label: `${item.names[locale]} · ${item.languageCode}`,
  }));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <FormAlert message={error} />
      <FieldGroup>
        <Field data-invalid={fieldErrors.domain ? true : undefined}>
          <FieldLabel htmlFor="project-domain">{t("domain")}</FieldLabel>
          <Input
            id="project-domain"
            name="domain"
            placeholder="ornek.com"
            required
            autoFocus
            aria-invalid={fieldErrors.domain ? true : undefined}
          />
          <FieldDescription>{t("domainHint")}</FieldDescription>
          <FieldError>{fieldErrors.domain ? t("invalidDomain") : null}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor="project-name">{t("name")}</FieldLabel>
          <Input
            id="project-name"
            name="name"
            required
            maxLength={80}
            placeholder={t("namePlaceholder")}
          />
          <FieldDescription>{t("nameHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>{t("market")}</FieldLabel>
          <Select
            items={marketItems}
            value={market}
            onValueChange={(value) => value && setMarket(value)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {marketItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("marketHint")}</FieldDescription>
        </Field>
      </FieldGroup>

      <FieldSet>
        <FieldLegend variant="label">{t("competitors")}</FieldLegend>
        <FieldDescription>{t("competitorsHint")}</FieldDescription>
        <div className="flex flex-col gap-2">
          {competitors.map((row, index) => {
            const invalid = Object.keys(fieldErrors).some((path) =>
              path.startsWith(`competitors.${index}.`),
            );
            return (
              <div key={row.key} className="flex items-start gap-2">
                <Input
                  aria-label={t("competitorName")}
                  placeholder={t("competitorName")}
                  value={row.name}
                  onChange={(event) =>
                    setCompetitors((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                  maxLength={80}
                />
                <Input
                  aria-label={t("competitorDomain")}
                  placeholder="rakip.com"
                  value={row.domain}
                  aria-invalid={invalid ? true : undefined}
                  onChange={(event) =>
                    setCompetitors((rows) =>
                      rows.map((item) =>
                        item.key === row.key ? { ...item, domain: event.target.value } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("removeCompetitor")}
                  onClick={() =>
                    setCompetitors((rows) => rows.filter((item) => item.key !== row.key))
                  }
                >
                  <X />
                </Button>
              </div>
            );
          })}
          {competitors.length < MAX_ONBOARDING_COMPETITORS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() =>
                setCompetitors((rows) => [...rows, { key: Date.now(), name: "", domain: "" }])
              }
            >
              <Plus data-icon="inline-start" />
              {t("addCompetitor")}
            </Button>
          )}
          {Object.keys(fieldErrors).some((path) => path.startsWith("competitors.")) && (
            <p className="text-sm text-destructive">{t("invalidCompetitor")}</p>
          )}
        </div>
      </FieldSet>

      <Button type="submit" size="lg" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
