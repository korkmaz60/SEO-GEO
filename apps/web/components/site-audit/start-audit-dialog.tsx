"use client";

import { AuditRunSchema, type Project } from "@seo-geo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiSend, errorMessage } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

const PAGE_LIMITS = ["100", "500", "1000", "2000", "5000"] as const;
const DEPTHS = ["3", "5", "10", "20"] as const;

export function StartAuditDialog({ project, disabled }: { project: Project; disabled: boolean }) {
  const t = useTranslations("siteAudit.start");
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [maxPages, setMaxPages] = useState<(typeof PAGE_LIMITS)[number]>("500");
  const [maxDepth, setMaxDepth] = useState<(typeof DEPTHS)[number]>("10");
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      await apiSend(
        "POST",
        `/workspaces/${workspace.id}/projects/${project.id}/site-audit/runs`,
        { maxPages: Number(maxPages), maxDepth: Number(maxDepth) },
        AuditRunSchema,
      );
      toast.success(t("started"));
      await queryClient.invalidateQueries({ queryKey: ["site-audit", project.id] });
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, t("failed")));
    } finally {
      setPending(false);
    }
  }

  const pageItems = PAGE_LIMITS.map((value) => ({
    value,
    label: t("pages", { count: Number(value) }),
  }));
  const depthItems = DEPTHS.map((value) => ({
    value,
    label: t("depth", { count: Number(value) }),
  }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={disabled} />}>
        <Play />
        {t("button")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { domain: project.domain })}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("maxPages")}</FieldLabel>
            <Select
              items={pageItems}
              value={maxPages}
              onValueChange={(value) => value && setMaxPages(value as (typeof PAGE_LIMITS)[number])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t("maxDepth")}</FieldLabel>
            <Select
              items={depthItems}
              value={maxDepth}
              onValueChange={(value) => value && setMaxDepth(value as (typeof DEPTHS)[number])}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {depthItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{t("politeness")}</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button onClick={start} disabled={pending}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
