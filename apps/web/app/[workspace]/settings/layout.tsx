import { hasWorkspaceRole } from "@seo-geo/contracts";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/page-header";
import { SettingsNav } from "@/components/settings/settings-nav";
import { getWorkspace } from "@/lib/server/api";

export default async function WorkspaceSettingsLayout({
  children,
  params,
}: LayoutProps<"/[workspace]/settings">) {
  const { workspace: slug } = await params;
  const [t, workspace] = await Promise.all([
    getTranslations("workspaceSettings"),
    getWorkspace(slug),
  ]);
  const base = `/${workspace.slug}/settings`;
  const isAdmin = hasWorkspaceRole(workspace.role, "admin");
  const items = [
    { href: base, label: t("nav.general") },
    { href: `${base}/members`, label: t("nav.members") },
    { href: `${base}/projects`, label: t("nav.projects") },
    { href: `${base}/providers`, label: t("nav.providers") },
    { href: `${base}/usage`, label: t("nav.usage") },
    ...(isAdmin ? [{ href: `${base}/audit-log`, label: t("nav.auditLog") }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <PageHeader
        title={t("title")}
        description={t("description", { workspace: workspace.name })}
      />
      <SettingsNav items={items} label={t("title")} />
      {children}
    </div>
  );
}
