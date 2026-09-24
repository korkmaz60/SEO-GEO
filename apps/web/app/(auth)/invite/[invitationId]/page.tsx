import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AuthCard } from "@/components/auth/auth-card";
import { InvitationResponse } from "@/components/auth/invitation-response";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/server/api";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.invite");
  return { title: t("title") };
}

export default async function InvitePage({ params }: PageProps<"/invite/[invitationId]">) {
  const { invitationId } = await params;
  const session = await getSession();
  const t = await getTranslations("auth.invite");

  if (!session) {
    const next = encodeURIComponent(`/invite/${invitationId}`);
    return (
      <AuthCard title={t("title")} description={t("signInFirst")}>
        <div className="flex flex-col gap-2">
          <Button size="lg" nativeButton={false} render={<Link href={`/sign-up?next=${next}`} />}>
            {t("createAccount")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link href={`/sign-in?next=${next}`} />}
          >
            {t("signIn")}
          </Button>
        </div>
      </AuthCard>
    );
  }
  return <InvitationResponse invitationId={invitationId} email={session.user.email} />;
}
