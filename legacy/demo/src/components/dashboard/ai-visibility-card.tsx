"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Platform {
  platform: string;
  visibility: number;
  citations: number;
  change: number;
}

const platformLabels: Record<string, string> = {
  GOOGLE_AI_OVERVIEW: "Google AI Overviews",
  CHATGPT: "ChatGPT",
  PERPLEXITY: "Perplexity",
  CLAUDE: "Claude",
};

const platformIcons: Record<string, string> = {
  GOOGLE_AI_OVERVIEW: "G",
  CHATGPT: "C",
  PERPLEXITY: "P",
  CLAUDE: "Cl",
};

interface AiVisibilityCardProps {
  data?: Platform[];
}

export function AiVisibilityCard({ data }: AiVisibilityCardProps) {
  const platforms = data ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">AI Platform Görünürlüğü</CardTitle>
          <Badge variant="outline" className="text-[10px] font-normal">Canlı</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Yapay zeka motorlarındaki mevcut görünürlük durumunuz</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {platforms.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">Veri yükleniyor...</p>
        ) : (
          platforms.map((platform) => (
            <div key={platform.platform} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                    {platformIcons[platform.platform] || platform.platform[0]}
                  </div>
                  <span className="text-sm font-medium">
                    {platformLabels[platform.platform] || platform.platform}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">%{platform.visibility}</span>
                  <div className="flex items-center gap-0.5">
                    {platform.change > 0 ? (
                      <TrendingUp className="size-3 text-success" />
                    ) : (
                      <TrendingDown className="size-3 text-destructive" />
                    )}
                    <span className={`text-[10px] font-medium ${platform.change > 0 ? "text-success" : "text-destructive"}`}>
                      {platform.change > 0 ? "+" : ""}{platform.change}%
                    </span>
                  </div>
                </div>
              </div>
              <Progress value={platform.visibility} className="h-1.5" />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{platform.citations} atıf</span>
                <span>Hedef: %80</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
