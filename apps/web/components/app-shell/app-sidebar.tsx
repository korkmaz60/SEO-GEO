"use client";

import { ChevronsUpDown, Palette, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { PREVIEW } from "@/lib/preview";

import { ApiStatus } from "./api-status";
import { NAV_GROUPS, WORKSPACE_SETTINGS, findActiveItem, type NavItem } from "./nav-config";
import { useRouteContext } from "./use-route-context";

export function AppSidebar() {
  const t = useTranslations();
  const ctx = useRouteContext();
  const pathname = usePathname();
  const active = findActiveItem(pathname, ctx);

  const renderItem = (item: NavItem) => {
    const label = t(`nav.items.${item.key}`);
    return (
      <SidebarMenuItem key={item.key}>
        <SidebarMenuButton
          isActive={active?.key === item.key}
          tooltip={label}
          render={<Link href={item.href(ctx)} />}
        >
          <item.icon />
          <span>{label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <ProjectSwitcher workspace={ctx.workspace} project={ctx.project} />
      </SidebarHeader>

      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.key}>
            <SidebarGroupLabel>{t(`nav.groups.${group.key}`)}</SidebarGroupLabel>
            <SidebarMenu>{group.items.map(renderItem)}</SidebarMenu>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          {renderItem(WORKSPACE_SETTINGS)}
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={pathname === "/design"}
              tooltip={t("nav.items.designSystem")}
              render={<Link href="/design" />}
            >
              <Palette />
              <span>{t("nav.items.designSystem")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="space-y-1 rounded-lg border px-3 py-2 group-data-[collapsible=icon]:hidden">
          <p className="text-xs text-muted-foreground">{t("shell.usage.title")}</p>
          <p className="text-sm font-medium tabular-nums">—</p>
          <p className="text-xs text-muted-foreground">{t("shell.usage.noBudget")}</p>
        </div>
        <ApiStatus className="px-2 pb-1 group-data-[collapsible=icon]:hidden" />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ProjectSwitcher({ workspace, project }: { workspace: string; project: string }) {
  const t = useTranslations("shell");
  const isPreview = workspace === PREVIEW.workspace.slug && project === PREVIEW.project.slug;
  const workspaceName = isPreview ? PREVIEW.workspace.name : workspace;
  const projectName = isPreview ? PREVIEW.project.domain : project;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" tooltip={t("switchProject")} />}
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              {projectName.slice(0, 1).toUpperCase()}
            </div>
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">{projectName}</span>
              <span className="truncate text-xs text-muted-foreground">{workspaceName}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("project")}</DropdownMenuLabel>
              <DropdownMenuItem render={<Link href={`/${workspace}/${project}/overview`} />}>
                {projectName}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <Plus className="size-4" />
              {t("newProject")}
              <span className="ml-auto text-xs text-muted-foreground">M1</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
