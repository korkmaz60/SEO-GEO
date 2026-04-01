"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, ArrowRight, Brain, Search, BarChart3 } from "lucide-react";

export function NoProject() {
  const router = useRouter();

  return (
    <div className="p-6 flex items-center justify-center min-h-[70vh]">
      <Card className="max-w-lg w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Globe className="size-7 text-primary" />
          </div>
          <CardTitle className="text-xl">Henüz Bir Site Eklemediniz</CardTitle>
          <CardDescription>
            Sitenizi ekleyin — otomatik SEO & GEO analizi yapılacak
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            {[
              { icon: Search, title: "Teknik SEO Taraması", desc: "Meta tag, H1, canonical, schema kontrolü" },
              { icon: Brain, title: "GEO Skor Hesaplama", desc: "AI motorları için uygunluk analizi" },
              { icon: BarChart3, title: "Sayfa Hızı Testi", desc: "Google PageSpeed ile performans ölçümü" },
            ].map((item) => (
              <div key={item.title} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <item.icon className="size-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <Button className="w-full gap-2" onClick={() => router.push("/onboarding")}>
            Site Ekle ve Analiz Et
            <ArrowRight className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
