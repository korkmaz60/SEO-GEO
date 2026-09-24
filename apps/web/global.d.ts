import type { Locale } from "@seo-geo/contracts";

import type messages from "./messages/tr.json";

// Type-checks message keys against the Turkish catalog (the source of truth).
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
