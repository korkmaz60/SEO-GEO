import { pageMetadata } from "@/components/module-page";
import { RankTrackerView } from "@/components/rank-tracker/rank-tracker-view";

export const generateMetadata = pageMetadata("rankTracker");

export default function Page() {
  return <RankTrackerView />;
}
