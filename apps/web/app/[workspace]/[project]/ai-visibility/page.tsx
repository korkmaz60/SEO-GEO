import { AiSummaryView } from "@/components/ai-visibility/ai-summary-view";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("aiSummary");

export default function Page() {
  return <AiSummaryView />;
}
