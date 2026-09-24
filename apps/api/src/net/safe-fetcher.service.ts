import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import {
  createSafeFetcher,
  type SafeFetchOptions,
  type SafeFetcher,
  type SafeResponse,
} from "@seo-geo/core/net";

import { APP_CONFIG } from "../config/config.module.js";
import type { AppConfig } from "../config/env.js";

/**
 * The only way to fetch URLs that users influence (crawler, sitemaps, robots.txt, llms.txt,
 * webhooks). See docs/security.md, "Outbound requests".
 */
@Injectable()
export class SafeFetcherService implements OnApplicationShutdown {
  private readonly fetcher: SafeFetcher;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.fetcher = createSafeFetcher({
      allowedPorts: config.outboundAllowedPorts,
      userAgent: `SEO-GEO-Bot/${config.version} (+https://github.com/korkmaz60/SEO-GEO)`,
    });
  }

  fetch(url: string | URL, options?: SafeFetchOptions): Promise<SafeResponse> {
    return this.fetcher.fetch(url, options);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.fetcher.close();
  }
}
