import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { PREVIEW_HOME } from "@/lib/preview";

export default async function DesignLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("design");
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur">
        <Button variant="ghost" size="sm" render={<Link href={PREVIEW_HOME} />}>
          <ArrowLeft className="size-4" />
          {t("backToApp")}
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</main>
    </div>
  );
}
