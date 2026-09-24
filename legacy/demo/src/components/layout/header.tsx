"use client";

import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Moon, Sun, Bell, Search, LogOut, Settings, User, CheckCheck, Info, AlertTriangle, CheckCircle2, XCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { useApi } from "@/hooks/use-api";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useState, useCallback } from "react";
import Link from "next/link";

const pageNames: Record<string, string> = {
  "/": "Dashboard",
  "/geo": "GEO Analiz",
  "/seo": "SEO Analiz",
  "/content": "İçerik Editörü",
  "/competitors": "Rakip Analizi",
  "/reports": "Raporlar",
  "/settings": "Ayarlar",
};

const searchItems = [
  { name: "Dashboard", href: "/", group: "Sayfalar" },
  { name: "GEO Analiz", href: "/geo", group: "Sayfalar" },
  { name: "SEO Analiz", href: "/seo", group: "Sayfalar" },
  { name: "İçerik Editörü", href: "/content", group: "Sayfalar" },
  { name: "Rakip Analizi", href: "/competitors", group: "Sayfalar" },
  { name: "Raporlar", href: "/reports", group: "Sayfalar" },
  { name: "AI Görünürlük", href: "/geo", group: "GEO" },
  { name: "Atıf Takibi", href: "/geo", group: "GEO" },
  { name: "Anahtar Kelimeler", href: "/seo", group: "SEO" },
  { name: "Teknik SEO", href: "/seo", group: "SEO" },
  { name: "Core Web Vitals", href: "/seo", group: "SEO" },
  { name: "Keyword Export (CSV)", href: "/api/export?type=keywords", group: "Export" },
  { name: "Sayfa Export (CSV)", href: "/api/export?type=pages", group: "Export" },
  { name: "Sorun Export (CSV)", href: "/api/export?type=issues", group: "Export" },
];

interface AlertItem {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface AlertsResponse {
  alerts: AlertItem[];
  unreadCount: number;
}

const alertIcons: Record<string, typeof Info> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const alertColors: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  error: "text-destructive",
  info: "text-primary",
};

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}g`;
  if (hours > 0) return `${hours}sa`;
  if (minutes > 0) return `${minutes}dk`;
  return "şimdi";
}

export function Header() {
  const { setTheme, theme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: alertData, refetch: refetchAlerts } = useApi<AlertsResponse>("/api/alerts?limit=15");

  const unreadCount = alertData?.unreadCount ?? 0;
  const alerts = alertData?.alerts ?? [];

  const markAllRead = useCallback(async () => {
    await fetch("/api/alerts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    refetchAlerts();
  }, [refetchAlerts]);

  const currentPage = pageNames[pathname] || "Dashboard";
  const initials = session?.user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "SK";

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 backdrop-blur-md px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />

      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href="/" />}>
              SEO.GEO
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{currentPage}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1.5">
        {/* Arama */}
        <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
          <DialogTrigger
            render={
              <Button variant="outline" size="sm" className="hidden sm:flex gap-2 text-muted-foreground h-8 w-56 justify-start px-3" />
            }
          >
            <Search className="size-3.5" />
            <span className="text-xs">Ara...</span>
            <kbd className="ml-auto pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </DialogTrigger>
          <DialogContent className="p-0 gap-0 max-w-lg">
            <DialogHeader className="sr-only">
              <DialogTitle>Arama</DialogTitle>
            </DialogHeader>
            <Command>
              <CommandInput placeholder="Sayfa, özellik veya ayar ara..." />
              <CommandList>
                <CommandEmpty>Sonuç bulunamadı.</CommandEmpty>
                {["Sayfalar", "GEO", "SEO", "Export"].map((group) => (
                  <CommandGroup key={group} heading={group}>
                    {searchItems
                      .filter((item) => item.group === group)
                      .map((item) => (
                        <CommandItem
                          key={item.name}
                          onSelect={() => {
                            setSearchOpen(false);
                            if (item.href.startsWith("/api/")) {
                              window.open(item.href, "_blank");
                            } else {
                              router.push(item.href);
                            }
                          }}
                        >
                          {group === "Export" && <Download className="size-3.5 mr-2 text-muted-foreground" />}
                          {item.name}
                        </CommandItem>
                      ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </DialogContent>
        </Dialog>

        {/* Bildirimler Dropdown */}
        <Popover>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="icon" className="relative h-8 w-8" />
            }
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold">Bildirimler</p>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={markAllRead}>
                  <CheckCheck className="size-3" />
                  Tümünü Okundu İşaretle
                </Button>
              )}
            </div>
            <ScrollArea className="max-h-[350px]">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Bell className="size-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Bildirim yok</p>
                </div>
              ) : (
                <div className="divide-y">
                  {alerts.map((alert) => {
                    const Icon = alertIcons[alert.type] || Info;
                    const color = alertColors[alert.type] || "text-muted-foreground";
                    return (
                      <div key={alert.id} className={`flex gap-3 px-4 py-3 ${!alert.read ? "bg-primary/5" : ""}`}>
                        <Icon className={`size-4 shrink-0 mt-0.5 ${color}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs leading-relaxed ${!alert.read ? "font-medium" : "text-muted-foreground"}`}>
                            {alert.message}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {formatTimeAgo(alert.createdAt)}
                          </p>
                        </div>
                        {!alert.read && (
                          <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        {/* Tema */}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        {/* Profil Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="h-8 gap-2 px-2" />}
          >
            <Avatar className="h-6 w-6">
              <AvatarFallback className="bg-gradient-to-br from-primary to-geo text-white text-[10px] font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline text-sm font-medium">
              {session?.user?.name || "Kullanıcı"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{session?.user?.name}</p>
                  <p className="text-xs text-muted-foreground">{session?.user?.email}</p>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <User className="mr-2 h-4 w-4" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Ayarlar
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Çıkış Yap
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
