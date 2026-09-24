"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusIcon, Loader2 } from "lucide-react";

interface AddKeywordDialogProps {
  onSuccess?: () => void;
}

export function AddKeywordDialog({ onSuccess }: AddKeywordDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [volume, setVolume] = useState("");
  const [difficulty, setDifficulty] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword,
          volume: volume ? parseInt(volume) : null,
          difficulty: difficulty ? parseInt(difficulty) : null,
        }),
      });
      if (res.ok) {
        setKeyword("");
        setVolume("");
        setDifficulty("");
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
        Kelime Ekle
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anahtar Kelime Ekle</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>Anahtar Kelime</Label>
            <Input placeholder="seo analiz aracı" value={keyword} onChange={(e) => setKeyword(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Aylık Hacim</Label>
              <Input type="number" placeholder="2400" value={volume} onChange={(e) => setVolume(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Zorluk (0-100)</Label>
              <Input type="number" placeholder="65" min={0} max={100} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} />
            </div>
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
