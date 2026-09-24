import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("competitors");

export default function Page() {
  return <ModulePage pageKey="competitors" />;
}
