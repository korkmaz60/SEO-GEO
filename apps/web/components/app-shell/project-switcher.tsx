"use client";

import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { initials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import { useCan, useCurrentProject, useWorkspace } from "@/lib/workspace-context";

function Monogram({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Current project and workspace; switches between projects, workspaces and creates new ones. */
export function ProjectSwitcher() {
  const t = useTranslations("shell");
  const { workspace, workspaces, projects } = useWorkspace();
  const project = useCurrentProject();
  const canCreateProject = useCan("admin");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" tooltip={t("switchProject")} />}
          >
            <Monogram name={project?.name ?? workspace.name} />
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">
                {project?.name ?? t("noProject")}
              </span>
              <span className="truncate text-xs text-muted-foreground">{workspace.name}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("projects")}</DropdownMenuLabel>
              {projects.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  render={<Link href={`/${workspace.slug}/${item.slug}/overview`} />}
                >
                  <Monogram name={item.name} className="size-6 rounded-md text-xs" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{item.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{item.domain}</span>
                  </span>
                  {item.id === project?.id && <Check className="ml-auto" aria-hidden />}
                </DropdownMenuItem>
              ))}
              {projects.length === 0 && (
                <DropdownMenuItem disabled>{t("noProjects")}</DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            {canCreateProject && (
              <DropdownMenuItem render={<Link href={`/${workspace.slug}/projects/new`} />}>
                <Plus />
                {t("newProject")}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Building2 />
                {t("switchWorkspace")}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t("workspaces")}</DropdownMenuLabel>
                  {workspaces.map((item) => (
                    <DropdownMenuItem key={item.id} render={<Link href={`/${item.slug}`} />}>
                      <span className="truncate">{item.name}</span>
                      {item.id === workspace.id && <Check className="ml-auto" aria-hidden />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/onboarding" />}>
                  <Plus />
                  {t("newWorkspace")}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
