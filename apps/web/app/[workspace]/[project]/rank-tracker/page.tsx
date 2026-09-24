import { ModulePage, pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("rankTracker");

export default function Page() {
  return <ModulePage pageKey="rankTracker" />;
}
