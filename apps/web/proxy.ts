import { NextResponse, type NextRequest } from "next/server";

/** Routes that work without a session. */
const PUBLIC_PREFIXES = [
  "/api",
  "/design",
  "/forgot-password",
  "/healthz",
  "/invite",
  "/reset-password",
  "/sign-in",
  "/sign-up",
  "/two-factor",
  "/verify-email",
];

const SESSION_COOKIES = ["seogeo.session_token", "__Secure-seogeo.session_token"];

/**
 * Optimistic check: without a session cookie, protected pages redirect to the sign-in page
 * and come back afterwards. Pages still verify the session with the api.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }
  if (SESSION_COOKIES.some((name) => request.cookies.has(name))) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except Next.js internals and static files.
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp|txt|xml)$).*)"],
};
