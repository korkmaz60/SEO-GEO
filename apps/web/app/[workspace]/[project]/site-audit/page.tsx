import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("siteAudit");

export default function Page() {
  return <ModulePage pageKey="siteAudit" />;
}
