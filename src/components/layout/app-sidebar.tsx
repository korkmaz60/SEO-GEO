"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Brain,
  Search,
  FileEdit,
  Users,
  FileBarChart,
  Settings,
  Zap,
  Globe,
  TrendingUp,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const mainNav = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "GEO Analiz", href: "/geo", icon: Brain },
  { title: "SEO Analiz", href: "/seo", icon: Search },
  { title: "İçerik Editörü", href: "/content", icon: FileEdit },
  { title: "Rakip Analizi", href: "/competitors", icon: Users },
  { title: "Raporlar", href: "/reports", icon: FileBarChart },
];

const insightNav = [
  { title: "AI Görünürlük", href: "/geo/visibility", icon: Globe },
  { title: "Atıf Takibi", href: "/geo/citations", icon: Zap },
  { title: "Trend Analizi", href: "/geo/trends", icon: TrendingUp },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link href="/" className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-geo text-white font-bold text-sm shrink-0">
            SG
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="font-bold text-base tracking-tight text-sidebar-foreground">
              SEO<span className="text-primary">.</span>GEO
            </span>
            <span className="text-[10px] text-sidebar-foreground/50 uppercase tracking-widest">
              Analytics Platform
            </span>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Ana Menü</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href)
                    }
                    tooltip={item.title}
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>GEO İçgörüleri</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {insightNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <item.icon className="size-4" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton render={<Link href="/settings" />} tooltip="Ayarlar">
              <Settings className="size-4" />
              <span>Ayarlar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
