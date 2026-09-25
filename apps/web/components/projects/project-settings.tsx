"use client";

import {
  BrandEntitySchema,
  MAX_COMPETITORS,
  ProjectDetailSchema,
  type Device,
  type Locale,
  type ProjectDetail,
} from "@seo-geo/contracts";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { toast } from "sonner";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiError, apiSend, errorMessage } from "@/lib/api";
import { MARKETS, findMarket } from "@/lib/locations";
import { toSlug } from "@/lib/slug";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { BrandDialog, type BrandInput } from "./brand-dialog";
import { BrandSwatch } from "./brand-swatch";

const DEVICES: Device[] = ["DESKTOP", "MOBILE"];

// Time zone names differ between Node and browsers, so the list is only built on the client.
const NO_ZONES: string[] = [];
let zones: string[] | undefined;
const noSubscription = () => () => {};
const clientZones = () => (zones ??= Intl.supportedValuesOf("timeZone"));

export function ProjectSettings({ project }: { project: ProjectDetail }) {
  const canEdit = useCan("member");
  const isAdmin = useCan("admin");
  return (
    <div className="flex flex-col gap-6">
      <GeneralSection project={project} canEdit={canEdit} />
      <BrandsSection project={project} canEdit={canEdit} />
      {isAdmin && <DangerSection project={project} />}
    </div>
  );
}

function GeneralSection({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const t = useTranslations("projectSettings");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { workspace } = useWorkspace();
  const timeZones = useSyncExternalStore(noSubscription, clientZones, () => NO_ZONES);
  const knownMarket = findMarket(project.locationCode);
  const [market, setMarket] = useState(String(project.locationCode));
  const [device, setDevice] = useState<Device>(project.device);
  const [includeSubdomains, setIncludeSubdomains] = useState(project.includeSubdomains);
  const [slug, setSlug] = useState(project.slug);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const marketItems = [
    ...MARKETS.map((item) => ({
      value: String(item.locationCode),
      label: `${item.names[locale]} · ${item.languageCode}`,
    })),
    // A project created through the api may use a market the picker does not list yet.
    ...(knownMarket
      ? []
      : [
          {
            value: String(project.locationCode),
            label: `${project.locationCode} · ${project.languageCode}`,
          },
        ]),
  ];
  const deviceItems = DEVICES.map((value) => ({ value, label: t(`devices.${value}`) }));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = findMarket(Number(market));
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      const updated = await apiSend(
        "PATCH",
        `/workspaces/${workspace.id}/projects/${project.id}`,
        {
          name: String(form.get("name")).trim(),
          slug,
          includeSubdomains,
          device,
          timezone: String(form.get("timezone")).trim(),
          ...(selected
            ? { locationCode: selected.locationCode, languageCode: selected.languageCode }
            : {}),
        },
        ProjectDetailSchema,
      );
      toast.success(t("general.saved"));
      if (updated.slug !== project.slug) {
        router.replace(`/${workspace.slug}/${updated.slug}/settings`);
      }
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiError && Object.keys(caught.fieldErrors).length > 0) {
        setFieldErrors(caught.fieldErrors);
      } else {
        setError(errorMessage(caught, te("generic")));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsSection
      title={t("general.title")}
      description={t("general.description")}
      onSubmit={canEdit ? save : undefined}
      footer={
        canEdit && (
          <Button type="submit" disabled={pending}>
            {t("general.save")}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <FormAlert message={error} />
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="project-name">{t("general.name")}</FieldLabel>
            <Input
              id="project-name"
              name="name"
              defaultValue={project.name}
              maxLength={80}
              required
              disabled={!canEdit}
            />
          </Field>
          <Field data-invalid={fieldErrors.slug ? true : undefined}>
            <FieldLabel htmlFor="project-slug">{t("general.slug")}</FieldLabel>
            <Input
              id="project-slug"
              value={slug}
              onChange={(event) => setSlug(toSlug(event.target.value, 50))}
              className="font-mono"
              required
              disabled={!canEdit}
              aria-invalid={fieldErrors.slug ? true : undefined}
            />
            <FieldError>{fieldErrors.slug ? t("general.slugTaken") : null}</FieldError>
          </Field>
          <Field>
            <FieldLabel>{t("general.domain")}</FieldLabel>
            <Input value={project.domain} disabled readOnly className="font-mono" />
            <FieldDescription>{t("general.domainHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{t("general.market")}</FieldLabel>
            <Select
              items={marketItems}
              value={market}
              onValueChange={(value) => value && setMarket(value)}
              disabled={!canEdit}
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
          </Field>
          <Field>
            <FieldLabel>{t("general.device")}</FieldLabel>
            <Select
              items={deviceItems}
              value={device}
              onValueChange={(value) => value && setDevice(value as Device)}
              disabled={!canEdit}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deviceItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field data-invalid={fieldErrors.timezone ? true : undefined}>
            <FieldLabel htmlFor="project-timezone">{t("general.timezone")}</FieldLabel>
            <Input
              id="project-timezone"
              name="timezone"
              list="project-timezones"
              defaultValue={project.timezone}
              required
              disabled={!canEdit}
              aria-invalid={fieldErrors.timezone ? true : undefined}
            />
            <datalist id="project-timezones">
              {timeZones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <FieldDescription>{t("general.timezoneHint")}</FieldDescription>
            <FieldError>{fieldErrors.timezone ? t("general.invalidTimezone") : null}</FieldError>
          </Field>
          <Field orientation="horizontal" className="sm:col-span-2">
            <FieldContent>
              <FieldLabel htmlFor="project-subdomains">{t("general.subdomains")}</FieldLabel>
              <FieldDescription>
                {t("general.subdomainsHint", { domain: project.domain })}
              </FieldDescription>
            </FieldContent>
            <Switch
              id="project-subdomains"
              checked={includeSubdomains}
              onCheckedChange={setIncludeSubdomains}
              disabled={!canEdit}
            />
          </Field>
        </FieldGroup>
      </div>
    </SettingsSection>
  );
}

function BrandsSection({ project, canEdit }: { project: ProjectDetail; canEdit: boolean }) {
  const t = useTranslations("projectSettings.brands");
  const router = useRouter();
  const { workspace } = useWorkspace();
  const base = `/workspaces/${workspace.id}/projects/${project.id}/brands`;
  const competitors = project.brands.filter((brand) => brand.kind === "COMPETITOR");

  async function create(input: BrandInput) {
    await apiSend("POST", base, input, BrandEntitySchema);
    toast.success(t("added", { name: input.name }));
    router.refresh();
  }

  async function update(brandId: string, input: BrandInput) {
    await apiSend("PATCH", `${base}/${brandId}`, input, BrandEntitySchema);
    toast.success(t("updated", { name: input.name }));
    router.refresh();
  }

  async function remove(brandId: string, name: string) {
    await apiSend("DELETE", `${base}/${brandId}`);
    toast.success(t("removed", { name }));
    router.refresh();
  }

  return (
    <SettingsSection
      id="brands"
      title={t("title")}
      description={t("description", { max: MAX_COMPETITORS })}
      action={
        canEdit &&
        competitors.length < MAX_COMPETITORS && (
          <BrandDialog
            title={t("addTitle")}
            onSave={create}
            trigger={
              <Button size="sm" variant="outline">
                <Plus data-icon="inline-start" />
                {t("add")}
              </Button>
            }
          />
        )
      }
    >
      <ul className="flex flex-col divide-y">
        {project.brands.map((brand) => (
          <li key={brand.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <BrandSwatch slot={brand.colorSlot} className="size-3" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 font-medium">
                {brand.name}
                {brand.kind === "OWN" && <Badge variant="secondary">{t("own")}</Badge>}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {brand.domains.join(", ")}
                {brand.aliases.length > 0 && ` · ${t("aliasesShort")}: ${brand.aliases.join(", ")}`}
                {brand.ambiguousAliases.length > 0 &&
                  ` · ${t("ambiguousShort")}: ${brand.ambiguousAliases.join(", ")}`}
              </span>
            </div>
            {canEdit && (
              <div className="flex shrink-0 gap-1">
                <BrandDialog
                  brand={brand}
                  title={t("editTitle", { name: brand.name })}
                  onSave={(input) => update(brand.id, input)}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={t("edit")}>
                      <Pencil />
                    </Button>
                  }
                />
                {brand.kind === "COMPETITOR" && (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon-sm" aria-label={t("remove")}>
                        <Trash2 />
                      </Button>
                    }
                    title={t("removeTitle", { name: brand.name })}
                    description={t("removeBody")}
                    confirmLabel={t("remove")}
                    onConfirm={() => remove(brand.id, brand.name)}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

function DangerSection({ project }: { project: ProjectDetail }) {
  const t = useTranslations("projectSettings.danger");
  const router = useRouter();
  const { workspace } = useWorkspace();
  const path = `/workspaces/${workspace.id}/projects/${project.id}`;

  async function archive() {
    await apiSend("POST", `${path}/archive`);
    toast.success(t("archived", { name: project.name }));
    router.push(`/${workspace.slug}`);
    router.refresh();
  }

  async function remove() {
    await apiSend("DELETE", path);
    toast.success(t("deleted", { name: project.name }));
    router.push(`/${workspace.slug}`);
    router.refresh();
  }

  return (
    <SettingsSection tone="danger" title={t("title")} description={t("description")}>
      <div className="flex flex-col divide-y">
        <div className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{t("archive")}</span>
            <span className="text-sm text-muted-foreground">{t("archiveHint")}</span>
          </div>
          <ConfirmDialog
            trigger={<Button variant="outline">{t("archive")}</Button>}
            title={t("archiveTitle", { name: project.name })}
            description={t("archiveBody")}
            confirmLabel={t("archive")}
            destructive={false}
            onConfirm={archive}
          />
        </div>
        <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{t("delete")}</span>
            <span className="text-sm text-muted-foreground">{t("deleteHint")}</span>
          </div>
          <ConfirmDialog
            trigger={<Button variant="destructive">{t("delete")}</Button>}
            title={t("deleteTitle", { name: project.name })}
            description={t("deleteBody")}
            confirmLabel={t("delete")}
            confirmText={project.slug}
            onConfirm={remove}
          />
        </div>
      </div>
    </SettingsSection>
  );
}
