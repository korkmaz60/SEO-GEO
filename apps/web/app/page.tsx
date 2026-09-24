import { redirect } from "next/navigation";

import { PREVIEW_HOME } from "@/lib/preview";

// M0: open the interface preview. From M1 on this redirects to the user's last project.
export default function HomePage() {
  redirect(PREVIEW_HOME);
}
