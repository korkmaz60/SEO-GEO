import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ALL_NAV_ITEMS, type Milestone, type PageKey } from "@/components/app-shell/nav-config";
import { EmptyState } from "@/components/data/empty-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";

export async function MilestoneBadge({ milestone }: { milestone: Milestone }) {
  const t = await getTranslations("common");
  return <Badge variant="outline">{t("comingIn", { milestone })}</Badge>;
}

function navItem(key: PageKey) {
  const item = ALL_NAV_ITEMS.find((candidate) => candidate.key === key);
  if (!item) throw new Error(`Unknown page key: ${key}`);
  return item;
}

/** `generateMetadata` for a page whose texts live under `pages.<key>`. */
export function pageMetadata(key: PageKey) {
  return async function generateMetadata(): Promise<Metadata> {
    const t = await getTranslations("pages");
    return { title: t(`${key}.title`), description: t(`${key}.description`) };
  };
}

/** Page template for modules that do not have data yet: header + honest empty state. */
export async function ModulePage({ pageKey }: { pageKey: PageKey }) {
  const t = await getTranslations("pages");
  const item = navItem(pageKey);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeader
        title={t(`${pageKey}.title`)}
        description={t(`${pageKey}.description`)}
        badge={<MilestoneBadge milestone={item.milestone} />}
      />
      <EmptyState
        icon={item.icon}
        title={t(`${pageKey}.emptyTitle`)}
        description={t(`${pageKey}.emptyBody`)}
      />
    </div>
  );
}
