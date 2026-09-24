"use client";

import { KeywordListSchema, type KeywordListItemInput } from "@seo-geo/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { useWorkspace } from "@/lib/workspace-context";

const NEW_LIST = "__new__";

export const keywordListsKey = (workspaceId: string) => ["keyword-lists", workspaceId] as const;

/** Saves keywords to an existing list or a new one. */
export function SaveToListDialog({
  open,
  onOpenChange,
  items,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: KeywordListItemInput[];
  onSaved?: () => void;
}) {
  const t = useTranslations("keywordExplorer.saveDialog");
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const lists = useQuery({
    queryKey: keywordListsKey(workspace.id),
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/keyword-lists`,
        z.object({ data: z.array(KeywordListSchema) }),
        { signal },
      ),
    enabled: open,
  });
  const [target, setTarget] = useState(NEW_LIST);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (target === NEW_LIST) {
        await apiSend(
          "POST",
          `/workspaces/${workspace.id}/keyword-lists`,
          { name: name.trim(), items },
          KeywordListSchema,
        );
      } else {
        await apiSend(
          "POST",
          `/workspaces/${workspace.id}/keyword-lists/${target}/items`,
          { items },
          KeywordListSchema,
        );
      }
      toast.success(t("saved", { count: items.length }));
      await queryClient.invalidateQueries({ queryKey: keywordListsKey(workspace.id) });
      onSaved?.();
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught, t("failed")));
    } finally {
      setPending(false);
    }
  }

  const listItems = [
    { value: NEW_LIST, label: t("newList") },
    ...(lists.data?.data ?? []).map((list) => ({
      value: list.id,
      label: `${list.name} (${list.itemCount})`,
    })),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={save} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description", { count: items.length })}</DialogDescription>
          </DialogHeader>
          <FormAlert message={error} />
          <FieldGroup>
            <Field>
              <FieldLabel>{t("list")}</FieldLabel>
              <Select
                items={listItems}
                value={target}
                onValueChange={(value) => value && setTarget(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {listItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {target === NEW_LIST && (
              <Field>
                <FieldLabel htmlFor="list-name">{t("name")}</FieldLabel>
                <Input
                  id="list-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  required
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending || items.length === 0}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
