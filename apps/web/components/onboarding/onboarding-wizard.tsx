"use client";

import {
  hasWorkspaceRole,
  type Locale,
  type ProjectDetail,
  type ProviderCredential,
  type WorkspaceSummary,
} from "@seo-geo/contracts";
import { ArrowRight, Check, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { DataForSeoForm } from "@/components/credentials/dataforseo-form";
import { ProjectForm } from "@/components/projects/project-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

import { WorkspaceForm, type CreatedWorkspace } from "./workspace-form";

const STEPS = ["workspace", "project", "provider"] as const;
type Step = (typeof STEPS)[number];

export function OnboardingWizard({
  userName,
  initialWorkspace,
  hasWorkspaces,
}: {
  userName: string;
  /** An existing workspace without projects (`/onboarding?workspace=…`). */
  initialWorkspace: WorkspaceSummary | null;
  hasWorkspaces: boolean;
}) {
  const t = useTranslations("setup");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [workspace, setWorkspace] = useState<CreatedWorkspace | null>(initialWorkspace);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [credential, setCredential] = useState<ProviderCredential | null>(null);
  const [step, setStep] = useState<Step>(initialWorkspace ? "project" : "workspace");
  const canCreateProject = !initialWorkspace || hasWorkspaceRole(initialWorkspace.role, "admin");
  const current = STEPS.indexOf(step);

  function finish() {
    if (!workspace || !project) return;
    // The server components (sidebar, switchers) read the new workspace and project.
    router.push(`/${workspace.slug}/${project.slug}/overview`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("welcome", { name: userName.split(" ")[0] ?? userName })}
        </h1>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      <ol className="grid grid-cols-3 gap-2" aria-label={t("progress")}>
        {STEPS.map((key, index) => {
          const done = index < current || (key === "provider" && credential !== null);
          const active = index === current && !done;
          return (
            <li
              key={key}
              aria-current={active ? "step" : undefined}
              className="flex flex-col gap-2"
            >
              <span className={cn("h-1 rounded-full bg-muted", (done || active) && "bg-primary")} />
              <span
                className={cn(
                  "flex items-center gap-1.5 text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3.5 text-primary" aria-hidden />
                ) : (
                  <span className="tabular-nums">{index + 1}.</span>
                )}
                {t(`steps.${key}`)}
              </span>
            </li>
          );
        })}
      </ol>

      {step === "workspace" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("workspace.title")}</CardTitle>
            <CardDescription>{t("workspace.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <WorkspaceForm
              onCreated={(created) => {
                setWorkspace(created);
                setStep("project");
              }}
            />
          </CardContent>
        </Card>
      )}

      {step === "project" && workspace && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("project.title")}</CardTitle>
            <CardDescription>
              {t("project.description", { workspace: workspace.name })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {canCreateProject ? (
              <ProjectForm
                workspaceId={workspace.id}
                onCreated={(created) => {
                  setProject(created);
                  setStep("provider");
                }}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <FormAlert message={t("project.forbidden")} />
                <Button
                  variant="outline"
                  className="self-start"
                  onClick={() => {
                    setWorkspace(null);
                    setStep("workspace");
                  }}
                >
                  {t("project.newWorkspace")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "provider" && workspace && project && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("provider.title")}</CardTitle>
            <CardDescription>{t("provider.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {credential ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3">
                  <CircleCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
                  <div className="flex flex-col gap-0.5">
                    <p className="font-medium">{t("provider.connected")}</p>
                    <p className="text-sm text-muted-foreground">
                      {credential.details.login}
                      {credential.details.balanceUsd !== undefined &&
                        ` · ${t("provider.balance", {
                          amount: formatUsd(credential.details.balanceUsd, locale),
                        })}`}
                    </p>
                  </div>
                </div>
                <Button size="lg" onClick={finish}>
                  {t("provider.done")}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </div>
            ) : (
              <DataForSeoForm
                workspaceId={workspace.id}
                onSaved={setCredential}
                autoFocus
                actions={
                  <Button type="button" variant="ghost" onClick={finish}>
                    {t("provider.skip")}
                  </Button>
                }
              />
            )}
          </CardContent>
        </Card>
      )}

      {hasWorkspaces && step === "workspace" && (
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("backToApp")}
          </Link>
        </p>
      )}
    </div>
  );
}
