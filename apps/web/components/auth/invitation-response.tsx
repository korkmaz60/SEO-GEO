"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { authErrorKey } from "@/lib/auth-errors";

import { AuthCard } from "./auth-card";
import { FormAlert } from "./form-alert";

export function InvitationResponse({
  invitationId,
  email,
}: {
  invitationId: string;
  email: string;
}) {
  const t = useTranslations("auth.invite");
  const tr = useTranslations("roles");
  const te = useTranslations("errors");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: async () => {
      const { data, error } = await authClient.organization.getInvitation({
        query: { id: invitationId },
      });
      if (error) throw error;
      return data;
    },
    retry: false,
  });

  async function respond(accept: boolean) {
    setPending(true);
    setError(null);
    const { error } = accept
      ? await authClient.organization.acceptInvitation({ invitationId })
      : await authClient.organization.rejectInvitation({ invitationId });
    if (error) {
      setPending(false);
      setError(te(authErrorKey(error)));
      return;
    }
    router.push(accept && invitation.data ? `/${invitation.data.organizationSlug}` : "/");
    router.refresh();
  }

  if (invitation.isPending) {
    return (
      <AuthCard title={t("title")}>
        <Skeleton className="h-16" />
      </AuthCard>
    );
  }
  if (invitation.isError || !invitation.data) {
    return (
      <AuthCard title={t("title")}>
        <FormAlert message={t("invalid", { email })} />
      </AuthCard>
    );
  }

  const data = invitation.data;
  return (
    <AuthCard
      title={t("title")}
      description={t("description", {
        inviter: data.inviterEmail,
        workspace: data.organizationName,
        role: tr(data.role as "owner" | "admin" | "member" | "viewer"),
      })}
    >
      <div className="flex flex-col gap-3">
        <FormAlert message={error} />
        <Button size="lg" onClick={() => respond(true)} disabled={pending}>
          {t("accept")}
        </Button>
        <Button size="lg" variant="outline" onClick={() => respond(false)} disabled={pending}>
          {t("decline")}
        </Button>
      </div>
    </AuthCard>
  );
}
