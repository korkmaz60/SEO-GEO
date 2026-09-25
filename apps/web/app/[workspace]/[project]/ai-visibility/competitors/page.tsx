import { CompetitorsView } from "@/components/ai-visibility/competitors-view";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("competitors");

export default function Page() {
  return <CompetitorsView />;
}
