"use client";

import { Laptop, Moon, Palette, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import { NAV_GROUPS, WORKSPACE_SETTINGS } from "./nav-config";
import { useRouteContext } from "./use-route-context";

const noSubscription = () => () => {};

export function CommandMenu() {
  const t = useTranslations();
  const router = useRouter();
  const ctx = useRouteContext();
  const { setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const isApple = useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
  const shortcut = isApple ? "⌘K" : "Ctrl K";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="w-44 justify-start gap-2 text-muted-foreground max-sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="max-sm:sr-only">{t("shell.openCommand")}</span>
        <kbd className="ml-auto rounded border bg-muted px-1.5 font-mono text-xs max-sm:hidden">
          {shortcut}
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={(next) => setOpen(next)}
        title={t("shell.openCommand")}
        description={t("shell.commandPlaceholder")}
      >
        {/* CommandDialog only provides the dialog; cmdk needs its own root. */}
        <Command>
          <CommandInput placeholder={t("shell.commandPlaceholder")} />
          <CommandList>
            <CommandEmpty>{t("shell.commandEmpty")}</CommandEmpty>
            {NAV_GROUPS.map((group) => (
              <CommandGroup key={group.key} heading={t(`nav.groups.${group.key}`)}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.key}
                    value={`${t(`nav.groups.${group.key}`)} ${t(`nav.items.${item.key}`)}`}
                    onSelect={() => run(() => router.push(item.href(ctx)))}
                  >
                    <item.icon />
                    {t(`nav.items.${item.key}`)}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandGroup heading={t("shell.commandPreferences")}>
              <CommandItem onSelect={() => run(() => router.push(WORKSPACE_SETTINGS.href(ctx)))}>
                <WORKSPACE_SETTINGS.icon />
                {t("nav.items.workspaceSettings")}
              </CommandItem>
              <CommandItem onSelect={() => run(() => router.push("/design"))}>
                <Palette />
                {t("nav.items.designSystem")}
              </CommandItem>
              <CommandItem onSelect={() => run(() => setTheme("light"))}>
                <Sun />
                {`${t("shell.theme.label")}: ${t("shell.theme.light")}`}
              </CommandItem>
              <CommandItem onSelect={() => run(() => setTheme("dark"))}>
                <Moon />
                {`${t("shell.theme.label")}: ${t("shell.theme.dark")}`}
              </CommandItem>
              <CommandItem onSelect={() => run(() => setTheme("system"))}>
                <Laptop />
                {`${t("shell.theme.label")}: ${t("shell.theme.system")}`}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
