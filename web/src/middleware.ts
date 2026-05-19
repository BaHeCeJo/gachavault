import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/admin", "/profile", "/collections", "/tierlists"];
const PUBLIC_OVERRIDES = ["/tierlists/share"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicOverride = PUBLIC_OVERRIDES.some((route) => pathname.startsWith(route));
  const isProtected = !isPublicOverride && PROTECTED_ROUTES.some((route) => pathname.startsWith(route));

  if (isProtected) {
    const token = request.cookies.get("access_token")?.value;
    if (!token) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
