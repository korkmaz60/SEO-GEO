import { ExternalLink } from "lucide-react";

import { safeExternalHref } from "@/lib/external-url";
import { cn } from "@/lib/utils";

/** Opens a crawled or provider URL in a new tab; renders nothing for non-http(s) URLs. */
export function ExternalLinkIcon({
  url,
  label,
  className,
}: {
  url: string | null | undefined;
  label: string;
  className?: string;
}) {
  const href = safeExternalHref(url);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={cn("shrink-0 text-muted-foreground hover:text-foreground", className)}
      aria-label={label}
    >
      <ExternalLink className="size-3.5" />
    </a>
  );
}
