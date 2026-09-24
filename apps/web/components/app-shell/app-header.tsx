"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Fragment } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PREVIEW } from "@/lib/preview";

import { CommandMenu } from "./command-menu";
import { LocaleSwitcher } from "./locale-switcher";
import { findActiveItem } from "./nav-config";
import { ThemeToggle } from "./theme-toggle";
import { useRouteContext } from "./use-route-context";

export function AppHeader() {
  const t = useTranslations();
  const pathname = usePathname();
  const params = useParams<{ project?: string }>();
  const ctx = useRouteContext();
  const active = findActiveItem(pathname, ctx);
  const isPreview = ctx.workspace === PREVIEW.workspace.slug;

  const crumbs: { label: string; href?: string }[] = [
    { label: isPreview ? PREVIEW.workspace.name : ctx.workspace, href: `/${ctx.workspace}` },
  ];
  if (params.project) {
    crumbs.push({
      label:
        isPreview && params.project === PREVIEW.project.slug
          ? PREVIEW.project.domain
          : params.project,
      href: `/${ctx.workspace}/${params.project}/overview`,
    });
  }
  if (active) crumbs.push({ label: t(`nav.items.${active.key}`) });

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger aria-label={t("shell.toggleSidebar")} className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-5" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList className="flex-nowrap">
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${index}`}>
                <BreadcrumbItem className={last ? "min-w-0" : "max-md:hidden"}>
                  {last || !crumb.href ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink render={<Link href={crumb.href} />}>
                      {crumb.label}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!last && <BreadcrumbSeparator className="max-md:hidden" />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1.5">
        {isPreview && (
          <Tooltip>
            <TooltipTrigger render={<Badge variant="outline" className="max-lg:hidden" />}>
              {t("common.preview")}
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{t("common.previewHint")}</TooltipContent>
          </Tooltip>
        )}
        <CommandMenu />
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
