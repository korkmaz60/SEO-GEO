"use client";

import { useApi } from "@/hooks/use-api";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

interface ModelsData {
  models: { id: string; name: string; provider: string; available: boolean }[];
}

interface ProvidersData {
  providers: { id: string; name: string; configured: boolean }[];
  default: string | null;
}

// Provider logoları
function ClaudeLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M16.28 2.477a1.62 1.62 0 0 0-2.08.96L8.093 18.33a1.62 1.62 0 0 0 .96 2.08 1.62 1.62 0 0 0 2.08-.96l6.106-14.893a1.62 1.62 0 0 0-.96-2.08ZM8.078 2.477a1.62 1.62 0 0 0-2.08.96L.44 17.37a1.62 1.62 0 0 0 .96 2.08 1.62 1.62 0 0 0 2.08-.96L9.037 3.596a1.62 1.62 0 0 0-.96-2.08v-.04Z"/>
    </svg>
  );
}

function GeminiLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12c2.31 0 4.46-.66 6.29-1.79a.75.75 0 0 0-.38-1.4c-1.07.08-2.2-.15-3.2-.7a6.65 6.65 0 0 1-3.32-5.78c0-2.38 1.3-4.56 3.32-5.78 1-.55 2.13-.78 3.2-.7a.75.75 0 0 0 .38-1.4A11.94 11.94 0 0 0 12 0Z"/>
    </svg>
  );
}

function OpenAILogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073ZM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494Z"/>
    </svg>
  );
}

const providerLogos: Record<string, { logo: React.FC<{ className?: string }>; color: string; label: string }> = {
  claude: { logo: ClaudeLogo, color: "text-orange-400", label: "Claude" },
  gemini: { logo: GeminiLogo, color: "text-blue-400", label: "Gemini" },
  openai: { logo: OpenAILogo, color: "text-green-400", label: "OpenAI" },
};

interface AiProviderSelectProps {
  value: string;
  onChange: (value: string) => void;
  onModelChange?: (model: string) => void;
  selectedModel?: string;
}

export function AiProviderSelect({ value, onChange, onModelChange, selectedModel }: AiProviderSelectProps) {
  const { data: providersData } = useApi<ProvidersData>("/api/ai/providers");
  const { data: modelsData } = useApi<ModelsData>("/api/ai/models");

  const providers = providersData?.providers ?? [];
  const configured = providers.filter((p) => p.configured);
  const models = modelsData?.models ?? [];

  if (configured.length === 0) {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 text-muted-foreground">
        <Sparkles className="size-3" />
        AI yapılandırılmamış
      </Badge>
    );
  }

  // Seçili provider'ın modelleri
  const providerModels = models.filter((m) => m.provider === value);
  const selectedProviderInfo = providerLogos[value];

  return (
    <div className="flex items-center gap-1.5">
      {/* Provider seçimi */}
      <Select value={value} onValueChange={(v) => { if (v) { onChange(v); onModelChange?.(""); } }}>
        <SelectTrigger className="w-[130px] h-8 text-xs gap-1.5">
          {selectedProviderInfo && <selectedProviderInfo.logo className={`size-3.5 ${selectedProviderInfo.color}`} />}
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {configured.map((p) => {
            const info = providerLogos[p.id];
            const Logo = info?.logo;
            return (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                <div className="flex items-center gap-2">
                  {Logo && <Logo className={`size-3.5 ${info.color}`} />}
                  <span>{p.name}</span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {/* Model seçimi */}
      {providerModels.length > 0 && onModelChange && (
        <Select value={selectedModel || ""} onValueChange={(v) => { if (v) onModelChange(v); }}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="Model seç..." />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel className="text-[10px]">{selectedProviderInfo?.label} Modelleri</SelectLabel>
              {providerModels.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  {m.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
