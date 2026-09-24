import { pageMetadata } from "@/components/module-page";
import { SiteAuditView } from "@/components/site-audit/site-audit-view";

export const generateMetadata = pageMetadata("siteAudit");

export default function Page() {
  return <SiteAuditView />;
}
