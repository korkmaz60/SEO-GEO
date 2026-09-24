import Link from "next/link";

/** The product name with its mark; links home. */
export function BrandMark() {
  return (
    <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
        SG
      </span>
      SEO-GEO
    </Link>
  );
}
