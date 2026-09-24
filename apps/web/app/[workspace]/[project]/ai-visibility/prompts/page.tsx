import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("prompts");

export default function Page() {
  return <ModulePage pageKey="prompts" />;
}
