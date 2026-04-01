"use client"

import * as React from "react"
import { useApi } from "@/hooks/use-api"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { ChevronsUpDownIcon, PlusIcon, GlobeIcon, Loader2 } from "lucide-react"
import { useState } from "react"

interface Project {
  id: string
  name: string
  domain: string
}

export function TeamSwitcher({
  teams: _teams,
}: {
  teams?: { name: string; logo: React.ReactNode; plan: string }[]
}) {
  const { isMobile } = useSidebar()
  const { data, refetch } = useApi<{ projects: Project[] }>("/api/projects")
  const [activeId, setActiveId] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newName, setNewName] = useState("")
  const [newDomain, setNewDomain] = useState("")
  const [creating, setCreating] = useState(false)

  const projects = data?.projects ?? []
  const active = projects.find((p) => p.id === activeId) || projects[0]

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, domain: newDomain }),
      })
      if (res.ok) {
        // Otomatik analiz başlat
        await fetch("/api/analyze", { method: "POST" })
        setNewName("")
        setNewDomain("")
        setDialogOpen(false)
        refetch()
        window.location.href = "/"
      }
    } finally {
      setCreating(false)
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
              <span className="truncate text-xs">Sitenizi bağlayın</span>
            </div>
          </SidebarMenuButton>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yeni Proje Ekle</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label htmlFor="np-name">Proje Adı</Label>
                  <Input id="np-name" placeholder="Projem" value={newName} onChange={(e) => setNewName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="np-domain">Domain</Label>
                  <Input id="np-domain" placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={creating}>
                  {creating && <Loader2 className="size-4 animate-spin mr-2" />}
                  Proje Oluştur
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </SidebarMenuItem>
      </SidebarMenu>
    )
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
            <ChevronsUpDownIcon className="ml-auto" />
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
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  onClick={() => setActiveId(project.id)}
                  className="gap-2 p-2"
                >
                  <div className="flex size-6 items-center justify-center rounded-md border">
                    <GlobeIcon className="size-3.5" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm">{project.name}</span>
                    <span className="block text-xs text-muted-foreground">{project.domain}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2 p-2" onClick={() => setDialogOpen(true)}>
                <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                  <PlusIcon className="size-4" />
                </div>
                <div className="font-medium text-muted-foreground">
                  Yeni Proje Ekle
                </div>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Proje Ekle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label htmlFor="project-name">Proje Adı</Label>
                <Input id="project-name" placeholder="Projem" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-domain">Domain</Label>
                <Input id="project-domain" placeholder="example.com" value={newDomain} onChange={(e) => setNewDomain(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={creating}>
                {creating && <Loader2 className="size-4 animate-spin mr-2" />}
                Proje Oluştur
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
