import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("keywordExplorer");

export default function Page() {
  return <ModulePage pageKey="keywordExplorer" />;
}
