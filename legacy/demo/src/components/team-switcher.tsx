"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { CheckIcon, ChevronsUpDownIcon, GlobeIcon, Loader2, PlusIcon } from "lucide-react";

import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface Project {
  id: string;
  name: string;
  domain: string;
}

interface ProjectsPayload {
  projects: Project[];
  activeProjectId: string | null;
}

export function TeamSwitcher({
  teams: _teams,
}: {
  teams?: { name: string; logo: React.ReactNode; plan: string }[];
}) {
  const { isMobile } = useSidebar();
  const pathname = usePathname();
  const { data, refetch } = useApi<ProjectsPayload>("/api/projects");

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newDomain, setNewDomain] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [switchingId, setSwitchingId] = React.useState<string | null>(null);

  const projects = data?.projects ?? [];

  React.useEffect(() => {
    const nextActiveId = data?.activeProjectId ?? projects[0]?.id ?? null;
    setActiveId(nextActiveId);
  }, [data?.activeProjectId, projects]);

  const active =
    projects.find((project) => project.id === activeId) ??
    projects.find((project) => project.id === data?.activeProjectId) ??
    projects[0];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, domain: newDomain }),
      });

      if (!res.ok) {
        return;
      }

      const json = (await res.json()) as { activeProjectId?: string | null };
      await refetch();

      try {
        await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: json.activeProjectId ?? undefined }),
        });
      } catch {
        // Yeni proje olustuktan sonra analiz basarisiz olsa da secim korunur.
      }

      setNewName("");
      setNewDomain("");
      setDialogOpen(false);
      window.location.href = pathname || "/";
    } finally {
      setCreating(false);
    }
  }

  async function handleSelectProject(projectId: string) {
    if (projectId === activeId || switchingId) return;

    setSwitchingId(projectId);

    try {
      const res = await fetch("/api/projects", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        return;
      }

      setActiveId(projectId);
      await refetch();
      window.location.href = pathname || "/";
    } finally {
      setSwitchingId(null);
    }
  }

  if (!active) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" onClick={() => setDialogOpen(true)}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <PlusIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Proje Ekle</span>
              <span className="truncate text-xs">Sitenizi baglayin</span>
            </div>
          </SidebarMenuButton>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni Proje Ekle</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="mt-2 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="np-name">Proje Adi</Label>
                  <Input
                    id="np-name"
                    placeholder="Projem"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="np-domain">Domain</Label>
                  <Input
                    id="np-domain"
                    placeholder="example.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                  Proje Olustur
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <GlobeIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{active.name}</span>
              <span className="truncate text-xs">{active.domain}</span>
            </div>
            {switchingId ? <Loader2 className="ml-auto size-4 animate-spin" /> : <ChevronsUpDownIcon className="ml-auto" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Projeler
              </DropdownMenuLabel>
              {projects.map((project) => {
                const isActive = project.id === active.id;
                const isSwitching = switchingId === project.id;

                return (
                  <DropdownMenuItem
                    key={project.id}
                    onClick={() => handleSelectProject(project.id)}
                    className="gap-2 p-2"
                    disabled={Boolean(switchingId)}
                  >
                    <div className="flex size-6 items-center justify-center rounded-md border">
                      <GlobeIcon className="size-3.5" />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm">{project.name}</span>
                      <span className="block text-xs text-muted-foreground">{project.domain}</span>
                    </div>
                    {isSwitching ? (
                      <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    ) : isActive ? (
                      <CheckIcon className="size-3.5 text-primary" />
                    ) : null}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 p-2" onClick={() => setDialogOpen(true)} disabled={creating || Boolean(switchingId)}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">Yeni Proje Ekle</div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Proje Ekle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="mt-2 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project-name">Proje Adi</Label>
                <Input
                  id="project-name"
                  placeholder="Projem"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-domain">Domain</Label>
                <Input
                  id="project-domain"
                  placeholder="example.com"
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Proje Olustur
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
