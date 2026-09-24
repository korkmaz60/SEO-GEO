import { redirect } from "next/navigation";

import { getSession, homePath } from "@/lib/server/api";

/** Signed-in users go to their first project (or onboarding); others to the sign-in page. */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const session = await getSession();
  if (!session) {
    // A failed email verification lands here with ?error=…
    const { error } = await searchParams;
    redirect(error ? "/sign-in?error=invalid_link" : "/sign-in");
  }
  redirect(await homePath(session));
}
