import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("backlinks");

export default function Page() {
  return <ModulePage pageKey="backlinks" />;
}
