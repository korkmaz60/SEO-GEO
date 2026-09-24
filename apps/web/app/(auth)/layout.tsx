import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 md:px-6">
        <BrandMark />
        <div className="flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-8 pb-16 md:pt-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
