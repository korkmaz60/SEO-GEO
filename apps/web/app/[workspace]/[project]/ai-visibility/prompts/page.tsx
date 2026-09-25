import { PromptsView } from "@/components/ai-visibility/prompts-view";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("prompts");

export default function Page() {
  return <PromptsView />;
}
