"use client";

import { ProjectDetailSchema, ProjectSchema, type Locale, type Project } from "@seo-geo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, FolderPlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { z } from "zod";

import { FormAlert } from "@/components/auth/form-alert";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiSend, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { findMarket } from "@/lib/locations";
import { useCan, useWorkspace } from "@/lib/workspace-context";

import { SettingsSection } from "./settings-section";

/** All projects of the workspace, including archived ones that can be restored here. */
export function ProjectsSettings() {
  const t = useTranslations("workspaceSettings.projects");
  const te = useTranslations("errors");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const isAdmin = useCan("admin");
  const queryKey = ["projects", workspace.id, "all"];
  const projects = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      apiGet(
        `/workspaces/${workspace.id}/projects?archived=true`,
        z.object({ data: z.array(ProjectSchema) }),
        { signal },
      ),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey });
    // The sidebar's project list comes from the server layout.
    router.refresh();
  };
  const setArchived = useMutation({
    mutationFn: (input: { project: Project; archived: boolean }) =>
      apiSend(
        "POST",
        `/workspaces/${workspace.id}/projects/${input.project.id}/${input.archived ? "archive" : "restore"}`,
        undefined,
        ProjectDetailSchema,
      ),
    onSuccess: (project) =>
      toast.success(
        project.archivedAt
          ? t("archived", { name: project.name })
          : t("restored", { name: project.name }),
      ),
    onError: (error) => toast.error(errorMessage(error, te("generic"))),
    onSettled: refresh,
  });

  async function remove(project: Project) {
    await apiSend("DELETE", `/workspaces/${workspace.id}/projects/${project.id}`);
    toast.success(t("deleted", { name: project.name }));
    await refresh();
  }

  return (
    <SettingsSection
      title={t("title")}
      description={t("description")}
      action={
        isAdmin && (
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href={`/${workspace.slug}/projects/new`} />}
          >
            <FolderPlus data-icon="inline-start" />
            {t("new")}
          </Button>
        )
      }
    >
      {projects.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : projects.isError ? (
        <FormAlert message={te("generic")} />
      ) : projects.data.data.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("project")}</TableHead>
              <TableHead className="max-sm:hidden">{t("market")}</TableHead>
              <TableHead className="max-md:hidden">{t("created")}</TableHead>
              {isAdmin && (
                <TableHead className="w-20">
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.data.data.map((project) => {
              const archived = project.archivedAt !== null;
              return (
                <TableRow key={project.id}>
                  <TableCell>
                    <div className="flex min-w-0 flex-col">
                      {archived ? (
                        <span className="flex items-center gap-2 font-medium text-muted-foreground">
                          {project.name}
                          <Badge variant="outline">{t("archivedBadge")}</Badge>
                        </span>
                      ) : (
                        <Link
                          href={`/${workspace.slug}/${project.slug}/overview`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {project.name}
                        </Link>
                      )}
                      <span className="truncate text-xs text-muted-foreground">
                        {project.domain}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-sm:hidden">
                    {findMarket(project.locationCode)?.names[locale] ?? project.locationCode} ·{" "}
                    {project.languageCode}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-md:hidden">
                    {formatDate(project.createdAt, locale)}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={archived ? t("restore") : t("archive")}
                          disabled={setArchived.isPending}
                          onClick={() => setArchived.mutate({ project, archived: !archived })}
                        >
                          {archived ? <ArchiveRestore /> : <Archive />}
                        </Button>
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label={t("delete")}>
                              <Trash2 />
                            </Button>
                          }
                          title={t("deleteTitle", { name: project.name })}
                          description={t("deleteBody")}
                          confirmLabel={t("delete")}
                          confirmText={project.slug}
                          onConfirm={() => remove(project)}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </SettingsSection>
  );
}
