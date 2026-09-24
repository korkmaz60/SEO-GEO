import {
  BarChart3,
  FileText,
  Globe,
  LayoutDashboard,
  Link2,
  MessageSquareText,
  PenLine,
  Quote,
  ScanSearch,
  Search,
  Settings,
  Sparkles,
  Swords,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

import type messages from "@/messages/tr.json";

type Messages = typeof messages;
export type NavItemKey = keyof Messages["nav"]["items"];
export type NavGroupKey = keyof Messages["nav"]["groups"];
/** Nav items that have a page (and therefore page texts in the catalogs). */
export type PageKey = keyof Messages["pages"] & NavItemKey;

/** Milestone in which a page starts showing real data (see docs/roadmap.md). */
export type Milestone = "M1" | "M2" | "M3" | "M4" | "M5";

export interface RouteContext {
  workspace: string;
  /** `null` while the workspace has no projects. */
  project: string | null;
}

export interface NavItem {
  /** Key under `nav.items` and `pages` in the message catalogs. */
  key: PageKey;
  /** Project pages need a project; without one they lead to project creation. */
  scope: "project" | "workspace";
  href: (ctx: RouteContext) => string;
  icon: LucideIcon;
  milestone: Milestone;
}

export interface NavGroup {
  /** Key under `nav.groups`. */
  key: NavGroupKey;
  items: NavItem[];
}

const project = (path: string) => ({
  scope: "project" as const,
  href: (ctx: RouteContext) =>
    ctx.project ? `/${ctx.workspace}/${ctx.project}/${path}` : `/${ctx.workspace}/projects/new`,
});
const workspace = (path: string) => ({
  scope: "workspace" as const,
  href: (ctx: RouteContext) => `/${ctx.workspace}/${path}`,
});

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "general",
    items: [{ key: "overview", ...project("overview"), icon: LayoutDashboard, milestone: "M2" }],
  },
  {
    key: "aiVisibility",
    items: [
      { key: "aiSummary", ...project("ai-visibility"), icon: Sparkles, milestone: "M3" },
      {
        key: "prompts",
        ...project("ai-visibility/prompts"),
        icon: MessageSquareText,
        milestone: "M3",
      },
      { key: "sources", ...project("ai-visibility/sources"), icon: Quote, milestone: "M3" },
      {
        key: "competitors",
        ...project("ai-visibility/competitors"),
        icon: Swords,
        milestone: "M3",
      },
    ],
  },
  {
    key: "seo",
    items: [
      { key: "rankTracker", ...project("rank-tracker"), icon: TrendingUp, milestone: "M2" },
      { key: "siteAudit", ...project("site-audit"), icon: ScanSearch, milestone: "M2" },
      { key: "backlinks", ...project("backlinks"), icon: Link2, milestone: "M4" },
      { key: "searchConsole", ...project("search-console"), icon: BarChart3, milestone: "M2" },
    ],
  },
  {
    key: "content",
    items: [{ key: "optimizer", ...project("content"), icon: PenLine, milestone: "M5" }],
  },
  {
    key: "research",
    items: [
      {
        key: "keywordExplorer",
        ...workspace("research/keywords"),
        icon: Search,
        milestone: "M2",
      },
      { key: "domainOverview", ...workspace("research/domains"), icon: Globe, milestone: "M4" },
    ],
  },
  {
    key: "manage",
    items: [
      { key: "reports", ...project("reports"), icon: FileText, milestone: "M4" },
      { key: "projectSettings", ...project("settings"), icon: Settings, milestone: "M1" },
    ],
  },
];

export const WORKSPACE_SETTINGS: NavItem = {
  key: "workspaceSettings",
  ...workspace("settings"),
  icon: Settings,
  milestone: "M1",
};

export const ALL_NAV_ITEMS: NavItem[] = [
  ...NAV_GROUPS.flatMap((group) => group.items),
  WORKSPACE_SETTINGS,
];

/** The nav item whose page is the longest match for the current path. */
export function findActiveItem(pathname: string, ctx: RouteContext): NavItem | undefined {
  let best: NavItem | undefined;
  let bestLength = -1;
  for (const item of ALL_NAV_ITEMS) {
    if (item.scope === "project" && !ctx.project) continue;
    const href = item.href(ctx);
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && href.length > bestLength) {
      best = item;
      bestLength = href.length;
    }
  }
  return best;
}
