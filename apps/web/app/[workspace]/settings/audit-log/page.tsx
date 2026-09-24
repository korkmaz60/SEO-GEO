import { hasWorkspaceRole } from "@seo-geo/contracts";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AuditLog } from "@/components/settings/audit-log";
import { getWorkspace } from "@/lib/server/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspaceSettings.nav");
  return { title: t("auditLog") };
}

export default async function AuditLogPage({
  params,
}: PageProps<"/[workspace]/settings/audit-log">) {
  const { workspace: slug } = await params;
  const workspace = await getWorkspace(slug);
  if (!hasWorkspaceRole(workspace.role, "admin")) notFound();
  return <AuditLog />;
}
