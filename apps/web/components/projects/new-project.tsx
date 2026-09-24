"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { FormAlert } from "@/components/auth/form-alert";
import { Card, CardContent } from "@/components/ui/card";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { ProjectForm } from "./project-form";

export function NewProject() {
  const t = useTranslations("setup.project");
  const router = useRouter();
  const { workspace } = useWorkspace();
  const canCreate = useCan("admin");

  if (!canCreate) return <FormAlert message={t("forbidden")} />;

  return (
    <Card>
      <CardContent>
        <ProjectForm
          workspaceId={workspace.id}
          onCreated={(project) => {
            router.push(`/${workspace.slug}/${project.slug}/overview`);
            router.refresh();
          }}
        />
      </CardContent>
    </Card>
  );
}
