import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("projectSettings");

export default function Page() {
  return <ModulePage pageKey="projectSettings" />;
}
