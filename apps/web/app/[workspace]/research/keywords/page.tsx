import { KeywordExplorer } from "@/components/keywords/keyword-explorer";
import { pageMetadata } from "@/components/module-page";

export const generateMetadata = pageMetadata("keywordExplorer");

export default function Page() {
  return <KeywordExplorer />;
}
