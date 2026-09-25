import { SourcesView } from "@/components/ai-visibility/sources-view";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("sources");

export default function Page() {
  return <SourcesView />;
}
