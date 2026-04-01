"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApi } from "@/hooks/use-api";
import { useSearchParams } from "next/navigation";
import { Settings, Link2, CheckCircle2, XCircle, Loader2, ExternalLink, KeyRound } from "lucide-react";
import { useState, Suspense } from "react";

interface IntegrationStatus {
  integrations: Record<string, { connected: boolean; propertyUrl?: string | null }>;
  apiKeys: Record<string, boolean>;
  aiProviders: Record<string, boolean>;
}

const integrationList = [
  {
    key: "GOOGLE_SEARCH_CONSOLE",
    name: "Google Search Console",
    desc: "Arama performansı, tıklama, gösterim, sıralama verileri",
    icon: "G",
    color: "bg-blue-500/10 text-blue-500",
    type: "google" as const,
  },
  {
    key: "GOOGLE_ANALYTICS",
    name: "Google Analytics 4",
    desc: "Organik trafik, kullanıcı davranışı, dönüşüm verileri",
    icon: "GA",
    color: "bg-orange-500/10 text-orange-500",
    type: "google" as const,
  },
  {
    key: "SERPAPI",
    name: "SerpApi",
    desc: "Google SERP sıralama takibi + index kontrolü — 100 ücretsiz sorgu/ay",
    icon: "S",
    color: "bg-emerald-500/10 text-emerald-500",
    type: "api_key" as const,
    envKey: "SERPAPI_KEY",
    helpUrl: "serpapi.com",
    helpText: "serpapi.com adresinden ücretsiz kayıt olup API key alın",
  },
  {
    key: "DATAFORSEO",
    name: "DataForSEO",
    desc: "Keyword hacim/zorluk, backlink analizi, on-page — min $50",
    icon: "DS",
    color: "bg-green-500/10 text-green-500",
    type: "api_key" as const,
    envKey: "DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD",
    helpUrl: "dataforseo.com",
    helpText: "dataforseo.com adresinden hesap oluşturup login/password alın",
  },
];

const aiProviders = [
  {
    key: "CLAUDE",
    name: "Claude (Anthropic)",
    desc: "GEO analiz, içerik skorlama, optimizasyon önerileri",
    icon: "C",
    color: "bg-orange-500/10 text-orange-500",
    envKey: "ANTHROPIC_API_KEY",
    helpUrl: "console.anthropic.com",
    helpText: "console.anthropic.com adresinden API key oluşturun",
  },
  {
    key: "GEMINI",
    name: "Gemini (Google)",
    desc: "GEO analiz, içerik skorlama — ücretsiz tier mevcut",
    icon: "G",
    color: "bg-blue-500/10 text-blue-400",
    envKey: "GEMINI_API_KEY",
    helpUrl: "aistudio.google.com",
    helpText: "aistudio.google.com adresinden ücretsiz API key alın",
  },
  {
    key: "OPENAI",
    name: "GPT-4 (OpenAI)",
    desc: "GEO analiz, içerik skorlama, optimizasyon önerileri",
    icon: "O",
    color: "bg-emerald-500/10 text-emerald-400",
    envKey: "OPENAI_API_KEY",
    helpUrl: "platform.openai.com",
    helpText: "platform.openai.com adresinden API key oluşturun",
  },
];

function SettingsContent() {
  const searchParams = useSearchParams();
  const connected = searchParams.get("connected");
  const error = searchParams.get("error");
  const { data, refetch } = useApi<IntegrationStatus>("/api/integrations/status");
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [apiKeyDialog, setApiKeyDialog] = useState<string | null>(null);

  async function handleGoogleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/integrations/google/connect");
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else { alert(json.error || "Bağlantı başlatılamadı"); setConnecting(false); }
    } catch {
      setConnecting(false);
    }
  }

  function handleConnect(item: typeof integrationList[number]) {
    if (item.type === "google") {
      handleGoogleConnect();
    } else {
      setApiKeyDialog(item.key);
    }
  }

  const activeApiItem = integrationList.find((i) => i.key === apiKeyDialog) || aiProviders.find((i) => i.key === apiKeyDialog);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings className="size-6" /> Ayarlar
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Entegrasyonları yönetin ve projenizi yapılandırın
        </p>
      </div>

      {connected === "google" && (
        <Alert>
          <CheckCircle2 className="h-4 w-4 text-success" />
          <AlertDescription>Google hesabı başarıyla bağlandı!</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>Bağlantı başarısız: {error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Entegrasyonlar</CardTitle>
          <CardDescription>
            Harici servisleri bağlayarak gerçek verilerinizi platform üzerinden görüntüleyin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {integrationList.map((item) => {
            const status = data?.integrations?.[item.key];
            const isConnected = item.type === "api_key"
              ? (data?.apiKeys?.[item.key] ?? false)
              : (status?.connected ?? false);

            return (
              <div key={item.key} className="flex items-center gap-4 rounded-lg border p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.color} text-xs font-bold`}>
                  {item.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{item.name}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {item.type === "google" ? "OAuth" : "API Key"}
                    </Badge>
                    {isConnected ? (
                      <Badge variant="outline" className="text-[10px] gap-1 text-success border-success/30">
                        <CheckCircle2 className="size-3" /> Bağlı
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                        <XCircle className="size-3" /> Bağlı Değil
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                </div>
                {!isConnected ? (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleConnect(item)}
                    disabled={connecting && item.type === "google"}
                  >
                    {connecting && item.type === "google" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : item.type === "google" ? (
                      <Link2 className="size-3.5" />
                    ) : (
                      <KeyRound className="size-3.5" />
                    )}
                    {item.type === "google" ? "Google ile Bağla" : "API Key Gir"}
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    {item.type === "google" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs"
                        disabled={syncing}
                        onClick={async () => {
                          setSyncing(true);
                          try {
                            await fetch("/api/integrations/search-console");
                            refetch();
                          } finally { setSyncing(false); }
                        }}
                      >
                        {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
                        Senkronize Et
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* API Key Dialog */}
      <Dialog open={!!apiKeyDialog} onOpenChange={() => setApiKeyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeApiItem?.name} Yapılandırma</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <Alert>
              <KeyRound className="h-4 w-4" />
              <AlertDescription>
                {activeApiItem?.helpText}
              </AlertDescription>
            </Alert>

            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <p className="text-sm font-medium">Nasıl yapılır?</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li><strong>{activeApiItem?.helpUrl}</strong> adresinden hesap oluşturun</li>
                <li>API key / credentials bilgilerinizi kopyalayın</li>
                <li>Projenizin <code className="bg-muted px-1 rounded">.env</code> dosyasına ekleyin:</li>
              </ol>
              <pre className="text-xs bg-background rounded p-2 overflow-x-auto">
                {apiKeyDialog === "SERPAPI" ? 'SERPAPI_KEY="your_api_key_here"'
                  : apiKeyDialog === "DATAFORSEO" ? 'DATAFORSEO_LOGIN="your_email"\nDATAFORSEO_PASSWORD="your_password"'
                  : apiKeyDialog === "CLAUDE" ? 'ANTHROPIC_API_KEY="sk-ant-..."'
                  : apiKeyDialog === "GEMINI" ? 'GEMINI_API_KEY="AIza..."'
                  : apiKeyDialog === "OPENAI" ? 'OPENAI_API_KEY="sk-..."'
                  : `${activeApiItem?.envKey}="your_key"`}
              </pre>
              <p className="text-xs text-muted-foreground">Sonra sunucuyu yeniden başlatın.</p>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setApiKeyDialog(null)}>
              Anladım
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Sağlayıcıları */}
      <Card>
        <CardHeader>
          <CardTitle>AI Sağlayıcıları</CardTitle>
          <CardDescription>
            GEO analiz, içerik skorlama ve optimizasyon önerileri için AI modelini seçin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aiProviders.map((ai) => {
            const isConfigured = data?.aiProviders?.[ai.key] ?? false;

            return (
              <div key={ai.key} className="flex items-center gap-4 rounded-lg border p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${ai.color} text-sm font-bold`}>
                  {ai.icon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{ai.name}</p>
                    <Badge variant="outline" className="text-[10px]">AI Model</Badge>
                    {isConfigured ? (
                      <Badge variant="outline" className="text-[10px] gap-1 text-success border-success/30">
                        <CheckCircle2 className="size-3" /> Yapılandırılmış
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
                        <XCircle className="size-3" /> Yapılandırılmamış
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{ai.desc}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => setApiKeyDialog(ai.key)}
                >
                  <KeyRound className="size-3.5" />
                  {isConfigured ? "Değiştir" : "Nasıl Kurulur?"}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Google Setup Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Google API Kurulumu</CardTitle>
          <CardDescription>Search Console ve Analytics için OAuth yapılandırması</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium">Kurulum Adımları:</p>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Google Cloud Console&apos;da yeni bir proje oluşturun</li>
              <li>Search Console API ve Analytics Data API&apos;yi etkinleştirin</li>
              <li>OAuth 2.0 İstemci Kimliği oluşturun (Web Uygulaması)</li>
              <li>Authorized JavaScript Origins: <code className="bg-muted px-1 rounded">http://localhost:3000</code></li>
              <li>Authorized Redirect URIs: <code className="bg-muted px-1 rounded">http://localhost:3000/api/integrations/google/callback</code></li>
              <li><code className="bg-muted px-1 rounded">.env</code> dosyasına <code className="bg-muted px-1 rounded">GOOGLE_CLIENT_ID</code> ve <code className="bg-muted px-1 rounded">GOOGLE_CLIENT_SECRET</code> ekleyin</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
