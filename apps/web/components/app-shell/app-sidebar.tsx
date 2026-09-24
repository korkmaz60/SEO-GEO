"use client";

import { Palette } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

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
import { useWorkspace } from "@/lib/workspace-context";

import { NAV_GROUPS, WORKSPACE_SETTINGS, findActiveItem, type NavItem } from "./nav-config";
import { NavUser } from "./nav-user";
import { ProjectSwitcher } from "./project-switcher";
import { UsageMeter } from "./usage-meter";
import { useRouteContext } from "./use-route-context";

/** The component showcase is a development aid, not part of the product navigation. */
const SHOW_DESIGN_SYSTEM = process.env.NODE_ENV !== "production";

export function AppSidebar() {
  const t = useTranslations();
  const { user } = useWorkspace();
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
        <ProjectSwitcher />
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
          {SHOW_DESIGN_SYSTEM && (
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
          )}
        </SidebarMenu>
        <UsageMeter className="group-data-[collapsible=icon]:hidden" />
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
