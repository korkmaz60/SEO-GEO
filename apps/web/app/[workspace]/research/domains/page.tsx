import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("domainOverview");

export default function Page() {
  return <ModulePage pageKey="domainOverview" />;
}
