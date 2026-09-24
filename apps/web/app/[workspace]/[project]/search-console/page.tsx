import { pageMetadata } from "@/components/module-page";
import { SearchConsoleView } from "@/components/search-console/search-console-view";

export const generateMetadata = pageMetadata("searchConsole");

export default function Page() {
  return <SearchConsoleView />;
}
