"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertCircle, Brain, BarChart3, Globe, Sparkles } from "lucide-react"

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    if (isRegister) {
      try {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error); setLoading(false); return }
        const result = await signIn("credentials", { email, password, redirect: false })
        if (result?.ok) { router.push("/"); router.refresh() }
      } catch {
        setError("Bir hata oluştu"); setLoading(false)
      }
    } else {
      const result = await signIn("credentials", { email, password, redirect: false })
      if (result?.error) { setError("E-posta veya şifre hatalı"); setLoading(false) }
      else { router.push("/"); router.refresh() }
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-geo text-white font-bold text-lg mb-2">
                  SG
                </div>
                <h1 className="text-2xl font-bold">
                  {isRegister ? "Hesap Oluştur" : "Hoş Geldiniz"}
                </h1>
                <p className="text-balance text-sm text-muted-foreground">
                  {isRegister
                    ? "SEO.GEO platformuna kayıt olun"
                    : "SEO.GEO hesabınıza giriş yapın"}
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {isRegister && (
                <div className="grid gap-2">
                  <Label htmlFor="name">Ad Soyad</Label>
                  <Input
                    id="name"
                    placeholder="Adınız Soyadınız"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="email">E-posta</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ornek@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="grid gap-2">
                <div className="flex items-center">
                  <Label htmlFor="password">Şifre</Label>
                  {!isRegister && (
                    <a href="#" className="ml-auto text-sm underline-offset-4 hover:underline">
                      Şifremi unuttum
                    </a>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder={isRegister ? "En az 6 karakter" : "Şifrenizi girin"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={isRegister ? 6 : undefined}
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin mr-2" />}
                {isRegister ? "Hesap Oluştur" : "Giriş Yap"}
              </Button>

              <div className="text-center text-sm">
                {isRegister ? "Zaten hesabınız var mı?" : "Hesabınız yok mu?"}{" "}
                <button
                  type="button"
                  onClick={() => { setIsRegister(!isRegister); setError("") }}
                  className="underline underline-offset-4 hover:text-primary"
                >
                  {isRegister ? "Giriş Yap" : "Kayıt Ol"}
                </button>
              </div>
            </div>
          </form>

          {/* Sag Panel — Branding */}
          <div className="relative hidden bg-gradient-to-br from-zinc-900 via-black to-zinc-900 md:flex flex-col justify-between p-8 text-white">
            <div className="space-y-4">
              <h2 className="text-xl font-bold leading-tight">
                Yapay Zeka Destekli<br />SEO & GEO Analiz
              </h2>
              <p className="text-sm text-white/70 leading-relaxed">
                Arama motorları ve AI platformlarındaki görünürlüğünüzü tek yerden takip edin.
              </p>
            </div>

            <div className="space-y-2.5 mt-8">
              {[
                { icon: Brain, title: "GEO Analiz", desc: "AI motorlarında görünürlük" },
                { icon: BarChart3, title: "SEO Takibi", desc: "Keyword & teknik analiz" },
                { icon: Globe, title: "Atıf Takibi", desc: "AI atıf izleme" },
                { icon: Sparkles, title: "İçerik Skoru", desc: "AI destekli optimizasyon" },
              ].map((item) => (
                <div key={item.title} className="flex items-center gap-3 rounded-lg bg-white/10 backdrop-blur-sm p-2.5">
                  <div className="rounded-md bg-white/20 p-1.5">
                    <item.icon className="size-3.5" />
                  </div>
                  <div>
                    <p className="text-xs font-medium">{item.title}</p>
                    <p className="text-[10px] text-white/60">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-lg border border-white/20 bg-white/10 backdrop-blur-sm p-3 text-center">
              <p className="text-[10px] text-white/60 mb-1">Demo hesap</p>
              <p className="text-xs font-mono">salih@example.com / 123456</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
