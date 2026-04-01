"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Globe, ArrowRight, Loader2, CheckCircle2, Search, Brain, BarChart3, Zap } from "lucide-react";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [analyzeResults, setAnalyzeResults] = useState<{ pagespeed?: { overall?: number; error?: string }; geo?: { overall?: number; error?: string }; crawl?: { issues?: number; error?: string } } | null>(null);

  async function handleCreateAndAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    // 1. Proje oluştur
    setAnalyzeStatus("Proje oluşturuluyor...");
    setAnalyzeProgress(10);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); setLoading(false); return; }
    } catch {
      setError("Proje oluşturulamadı");
      setLoading(false);
      return;
    }

    // 2. Otomatik analiz başlat
    setStep(2);
    setAnalyzeStatus("Site taranıyor...");
    setAnalyzeProgress(30);

    try {
      // Kısa bekleme — UI feedback için
      await new Promise((r) => setTimeout(r, 500));
      setAnalyzeStatus("Teknik SEO analizi yapılıyor...");
      setAnalyzeProgress(50);

      const analyzeRes = await fetch("/api/analyze", { method: "POST" });
      const analyzeData = await analyzeRes.json();

      setAnalyzeProgress(80);
      setAnalyzeStatus("Skorlar hesaplanıyor...");
      await new Promise((r) => setTimeout(r, 500));

      setAnalyzeProgress(100);
      setAnalyzeResults(analyzeData.results || {});
      setAnalyzeStatus("Tamamlandı!");

      await new Promise((r) => setTimeout(r, 800));
      setStep(3);
    } catch {
      setAnalyzeProgress(100);
      setAnalyzeStatus("Analiz kısmen tamamlandı");
      setStep(3);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Progress Steps */}
        <div className="flex items-center gap-2 justify-center">
          {[
            { n: 1, label: "Site Bilgisi" },
            { n: 2, label: "Analiz" },
            { n: 3, label: "Hazır" },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step >= s.n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}>
                  {step > s.n ? <CheckCircle2 className="size-4" /> : s.n}
                </div>
                <span className="text-[10px] text-muted-foreground">{s.label}</span>
              </div>
              {i < 2 && <div className={`w-16 h-0.5 mb-4 ${step > s.n ? "bg-primary" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Site Ekle */}
        {step === 1 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Globe className="size-7 text-primary" />
              </div>
              <CardTitle className="text-xl">Sitenizi Ekleyin</CardTitle>
              <CardDescription>
                Domain girin, gerisini biz halledelim — otomatik SEO & GEO analizi yapacağız
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAndAnalyze} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label>Proje Adı</Label>
                  <Input placeholder="Şirketim" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Domain</Label>
                  <Input placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
                  <p className="text-[10px] text-muted-foreground">https:// olmadan yazın</p>
                </div>
                <Button type="submit" className="w-full gap-2" disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                  Ekle ve Analiz Et
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Analiz */}
        {step === 2 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Search className="size-7 text-primary animate-pulse" />
              </div>
              <CardTitle className="text-xl">{domain} Analiz Ediliyor</CardTitle>
              <CardDescription>{analyzeStatus}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Progress value={analyzeProgress} className="h-2" />
              <div className="space-y-3">
                {[
                  { icon: Search, title: "Teknik SEO Taraması", desc: "Meta tag, H1, canonical, schema", done: analyzeProgress >= 50 },
                  { icon: BarChart3, title: "Sayfa Hızı Testi", desc: "Google PageSpeed Insights", done: analyzeProgress >= 80 },
                  { icon: Brain, title: "GEO Skor Hesaplama", desc: "AI motorları uygunluk analizi", done: analyzeProgress >= 100 },
                ].map((item) => (
                  <div key={item.title} className="flex items-center gap-3 rounded-lg border p-3">
                    <div className={`rounded-md p-2 ${item.done ? "bg-success/10" : "bg-muted"}`}>
                      {item.done ? (
                        <CheckCircle2 className="size-4 text-success" />
                      ) : (
                        <Loader2 className="size-4 text-muted-foreground animate-spin" />
                      )}
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${item.done ? "" : "text-muted-foreground"}`}>{item.title}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Tamamlandı */}
        {step === 3 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="size-7 text-success" />
              </div>
              <CardTitle className="text-xl">Analiz Tamamlandı!</CardTitle>
              <CardDescription>
                <strong>{domain}</strong> başarıyla analiz edildi
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Özet Sonuçlar */}
              {analyzeResults && (
                <div className="grid grid-cols-3 gap-3">
                  {analyzeResults.pagespeed && !analyzeResults.pagespeed.error && (
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums">{analyzeResults.pagespeed.overall ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Hız Skoru</p>
                    </div>
                  )}
                  {analyzeResults.geo && !analyzeResults.geo.error && (
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums">{analyzeResults.geo.overall ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">GEO Skor</p>
                    </div>
                  )}
                  {analyzeResults.crawl && !analyzeResults.crawl.error && (
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-2xl font-bold tabular-nums">{analyzeResults.crawl.issues ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Sorun</p>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <p className="text-sm font-medium">Sonraki Adımlar:</p>
                <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Dashboard&apos;dan skorlarınızı inceleyin</li>
                  <li>Anahtar kelimelerinizi ekleyin (SEO Analiz sayfası)</li>
                  <li>Rakiplerinizi ekleyin (Rakip Analizi sayfası)</li>
                  <li>Ayarlar&apos;dan Google Search Console bağlayın</li>
                </ul>
              </div>

              <Button className="w-full gap-2" onClick={() => router.push("/")}>
                Dashboard&apos;a Git
                <ArrowRight className="size-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
