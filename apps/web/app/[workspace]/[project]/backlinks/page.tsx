import { Suspense } from "react";

import { BacklinksView } from "@/components/backlinks/backlinks-view";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("backlinks");

export default function Page() {
  // The view reads the open tab from the URL.
  return (
    <Suspense>
      <BacklinksView />
    </Suspense>
  );
}
