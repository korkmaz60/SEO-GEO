"use client"

import * as React from "react"
import { useSession } from "next-auth/react"

import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  BrainIcon,
  SearchIcon,
  FileEditIcon,
  UsersIcon,
  FileBarChartIcon,
  GlobeIcon,
  ZapIcon,
  TrendingUpIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"

const data = {
  teams: [
    {
      name: "SEO.GEO",
      logo: <span className="font-bold text-xs">SG</span>,
      plan: "Analytics Platform",
    },
  ],
  navMain: [
    {
      title: "Dashboard",
      url: "/",
      icon: <LayoutDashboardIcon />,
      isActive: true,
      items: [
        { title: "Genel Bakış", url: "/" },
        { title: "Performans Trendi", url: "/" },
      ],
    },
    {
      title: "GEO Analiz",
      url: "/geo",
      icon: <BrainIcon />,
      items: [
        { title: "GEO Skoru", url: "/geo" },
        { title: "AI Platformları", url: "/geo" },
        { title: "Atıf Takibi", url: "/geo" },
        { title: "Kontrol Listesi", url: "/geo" },
      ],
    },
    {
      title: "SEO Analiz",
      url: "/seo",
      icon: <SearchIcon />,
      items: [
        { title: "Anahtar Kelimeler", url: "/seo" },
        { title: "Teknik SEO", url: "/seo" },
        { title: "Sayfa Hızı", url: "/seo" },
        { title: "Core Web Vitals", url: "/seo" },
      ],
    },
    {
      title: "AI Yapılacaklar",
      url: "/actions",
      icon: <SparklesIcon />,
      items: [
        { title: "Aksiyon Planı", url: "/actions" },
      ],
    },
    {
      title: "İçerik Editörü",
      url: "/content",
      icon: <FileEditIcon />,
      items: [
        { title: "İçerik Analizi", url: "/content" },
        { title: "AI Önerileri", url: "/content" },
      ],
    },
    {
      title: "Ayarlar",
      url: "/settings",
      icon: <Settings2Icon />,
      items: [
        { title: "Genel", url: "/settings" },
        { title: "API Anahtarları", url: "/settings" },
        { title: "Bildirimler", url: "/settings" },
      ],
    },
  ],
  projects: [
    { name: "Rakip Analizi", url: "/competitors", icon: <UsersIcon /> },
    { name: "Raporlar", url: "/reports", icon: <FileBarChartIcon /> },
    { name: "AI Görünürlük", url: "/geo", icon: <GlobeIcon /> },
    { name: "Atıf Takibi", url: "/geo", icon: <ZapIcon /> },
    { name: "Trend Analizi", url: "/geo", icon: <TrendingUpIcon /> },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()

  const user = {
    name: session?.user?.name || "Kullanıcı",
    email: session?.user?.email || "kullanici@example.com",
    avatar: session?.user?.image || "",
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
