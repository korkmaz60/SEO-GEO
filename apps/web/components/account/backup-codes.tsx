"use client";

import { Copy, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/** One-time recovery codes with copy and download; shown only right after generation. */
export function BackupCodes({ codes }: { codes: string[] }) {
  const t = useTranslations("account.twoFactor");
  const text = codes.join("\n");

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border bg-muted/40 p-4 font-mono text-sm sm:grid-cols-3">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            toast.success(t("codesCopied"));
          }}
        >
          <Copy data-icon="inline-start" />
          {t("copyCodes")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent(`${text}\n`)}`}
              download="seo-geo-backup-codes.txt"
            />
          }
        >
          <Download data-icon="inline-start" />
          {t("downloadCodes")}
        </Button>
      </div>
    </div>
  );
}
