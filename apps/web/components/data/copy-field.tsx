"use client";

import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** A value shown as code with a button that copies it, e.g. a URL or a command. */
export function CopyField({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const t = useTranslations("common");
  return (
    <div className="flex items-start gap-2">
      <code
        className={
          multiline
            ? "min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs whitespace-pre select-all"
            : "min-w-0 flex-1 rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all select-all"
        }
      >
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-label={t("copy")}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          toast.success(t("copied"));
        }}
      >
        <Copy />
      </Button>
    </div>
  );
}
