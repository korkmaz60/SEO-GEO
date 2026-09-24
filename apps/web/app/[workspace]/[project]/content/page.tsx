import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("optimizer");

export default function Page() {
  return <ModulePage pageKey="optimizer" />;
}
