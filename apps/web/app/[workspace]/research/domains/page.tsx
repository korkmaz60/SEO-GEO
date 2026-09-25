import { Suspense } from "react";

import { DomainOverviewView } from "@/components/domains/domain-overview-view";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("domainOverview");

export default function Page() {
  // The view reads the domain and market from the URL.
  return (
    <Suspense>
      <DomainOverviewView />
    </Suspense>
  );
}
