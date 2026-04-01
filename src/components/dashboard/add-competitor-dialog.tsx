"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusIcon, Loader2 } from "lucide-react";

interface AddCompetitorDialogProps {
  onSuccess?: () => void;
}

export function AddCompetitorDialog({ onSuccess }: AddCompetitorDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/competitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      if (res.ok) {
        setName("");
        setDomain("");
        setOpen(false);
        onSuccess?.();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <PlusIcon className="size-4" />
        Rakip Ekle
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rakip Ekle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Rakip Adı</Label>
            <Input placeholder="Rakip Şirket" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Domain</Label>
            <Input placeholder="rakip.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="size-4 animate-spin mr-2" />}
            Ekle
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
