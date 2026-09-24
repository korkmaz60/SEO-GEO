import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("reports");

export default function Page() {
  return <ModulePage pageKey="reports" />;
}
