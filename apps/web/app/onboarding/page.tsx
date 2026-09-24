import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requireSession } from "@/lib/server/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const session = await requireSession();
  const { workspace: slug } = await searchParams;
  const workspace = session.workspaces.find((candidate) => candidate.slug === slug) ?? null;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 md:px-6">
        <BrandMark />
        <div className="flex items-center gap-1.5">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 pt-6 pb-16 md:pt-12">
        <div className="w-full max-w-xl">
          <OnboardingWizard
            userName={session.user.name}
            initialWorkspace={workspace}
            hasWorkspaces={session.workspaces.length > 0}
          />
        </div>
      </main>
    </div>
  );
}
