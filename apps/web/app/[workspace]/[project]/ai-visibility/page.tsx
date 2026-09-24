import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("aiSummary");

export default function Page() {
  return <ModulePage pageKey="aiSummary" />;
}
