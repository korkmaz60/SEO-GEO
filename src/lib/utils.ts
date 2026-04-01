import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Güvenli domain eşleştirme — includes() yerine exact hostname match.
 * "example.com" → "example.com" ve "www.example.com" eşleşir
 * "example.com" → "not-example.com" veya "example.com.spam.net" eşleşMEZ
 */
export function domainMatches(urlOrDomain: string, targetDomain: string): boolean {
  const target = targetDomain.toLowerCase().replace(/^www\./, "");

  // URL'den hostname çıkar
  let hostname: string;
  try {
    if (urlOrDomain.startsWith("http")) {
      hostname = new URL(urlOrDomain).hostname.toLowerCase();
    } else {
      hostname = urlOrDomain.toLowerCase().replace(/\/.*$/, "");
    }
  } catch {
    hostname = urlOrDomain.toLowerCase();
  }

  hostname = hostname.replace(/^www\./, "");

  // Exact match veya subdomain match
  return hostname === target || hostname.endsWith(`.${target}`);
}

/**
 * Domain'den base ismi çıkar — TLD'leri doğru kaldır
 * "example.com" → "example"
 * "my-site.co.uk" → "my-site"
 */
export function extractDomainBase(domain: string): string {
  const cleaned = domain.toLowerCase().replace(/^www\./, "");
  // Bilinen çift TLD'ler
  const doubleTlds = ["co.uk", "co.jp", "co.kr", "com.tr", "com.br", "com.au", "org.uk", "net.tr", "gov.tr"];
  for (const dtld of doubleTlds) {
    if (cleaned.endsWith(`.${dtld}`)) {
      return cleaned.replace(`.${dtld}`, "");
    }
  }
  // Tek TLD
  return cleaned.replace(/\.[^.]+$/, "");
}
