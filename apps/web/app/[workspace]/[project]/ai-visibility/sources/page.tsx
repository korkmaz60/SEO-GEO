import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("sources");

export default function Page() {
  return <ModulePage pageKey="sources" />;
}
