import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname === "/login";
  const isApiRoute = pathname.startsWith("/api/");

  // API rotalarına her zaman izin ver
  if (isApiRoute) return NextResponse.next();

  // NextAuth JWT cookie kontrolü
  const token =
    request.cookies.get("authjs.session-token") ??
    request.cookies.get("__Secure-authjs.session-token");

  const isLoggedIn = !!token;

  // Giriş yapmamışsa login sayfasına yönlendir
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Giriş yapmışsa login sayfasından dashboard'a yönlendir
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|static|favicon.ico).*)"],
};
