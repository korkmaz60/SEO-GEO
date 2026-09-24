"use client";

import {
  AtSign,
  BookOpen,
  CircleHelp,
  Image as ImageIcon,
  MapPin,
  Megaphone,
  MessagesSquare,
  Newspaper,
  ShoppingBag,
  Sparkles,
  Star,
  TextQuote,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** SERP element types with an icon and a translated name, in display order. */
export const SERP_FEATURES = {
  ai_overview: Sparkles,
  featured_snippet: TextQuote,
  local_pack: MapPin,
  people_also_ask: CircleHelp,
  knowledge_graph: BookOpen,
  top_stories: Newspaper,
  video: Video,
  short_videos: Video,
  images: ImageIcon,
  shopping: ShoppingBag,
  popular_products: ShoppingBag,
  discussions_and_forums: MessagesSquare,
  perspectives: Users,
  twitter: AtSign,
  google_reviews: Star,
  paid: Megaphone,
} satisfies Record<string, LucideIcon>;

export type KnownSerpFeature = keyof typeof SERP_FEATURES;

export function isKnownFeature(type: string): type is KnownSerpFeature {
  return Object.hasOwn(SERP_FEATURES, type);
}

interface SerpFeatureIconsProps {
  features: string[];
  owned: string[];
  aiOverviewCited: boolean;
  max?: number;
}

/** Icons of the SERP features on a results page; owned ones are highlighted. */
export function SerpFeatureIcons({
  features,
  owned,
  aiOverviewCited,
  max = 5,
}: SerpFeatureIconsProps) {
  const t = useTranslations("serpFeatures");
  const known = (Object.keys(SERP_FEATURES) as KnownSerpFeature[]).filter((type) =>
    features.includes(type),
  );
  if (known.length === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const shown = known.slice(0, max);

  return (
    <div className="flex items-center gap-1">
      {shown.map((type) => {
        const Icon = SERP_FEATURES[type];
        const isOwned = type === "ai_overview" ? aiOverviewCited : owned.includes(type);
        const state =
          type === "ai_overview"
            ? aiOverviewCited
              ? t("aiCited")
              : t("aiNotCited")
            : isOwned
              ? t("owned")
              : null;
        return (
          <Tooltip key={type}>
            <TooltipTrigger
              render={<span />}
              className={cn(
                "inline-flex size-6 items-center justify-center rounded-md",
                isOwned
                  ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                  : "text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              <span className="sr-only">
                {t(`types.${type}`)}
                {state ? ` (${state})` : ""}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t(`types.${type}`)}
              {state && <span className="text-muted-foreground"> · {state}</span>}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {known.length > shown.length && (
        <span className="text-xs text-muted-foreground tabular-nums">
          +{known.length - shown.length}
        </span>
      )}
    </div>
  );
}
