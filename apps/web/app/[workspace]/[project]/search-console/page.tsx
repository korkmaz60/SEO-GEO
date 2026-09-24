import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("searchConsole");

export default function Page() {
  return <ModulePage pageKey="searchConsole" />;
}
