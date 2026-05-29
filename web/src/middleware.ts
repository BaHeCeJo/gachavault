import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_ROUTES = ["/admin", "/profile", "/collections", "/tierlists"];
const PUBLIC_OVERRIDES = ["/tierlists/share"];
const ADMIN_ROLES = new Set(["admin", "superadmin"]);

// Decode the payload of a JWT without verifying its signature. This is a
// UX-only fast path that lets us skip the /admin round-trip for users whose
// token claims aren't an admin role at all (common case). The real admin
// gate lives in web/src/app/admin/layout.tsx, which calls auth-service
// /auth/me to verify the signature server-side. A forged role claim here
// would survive this middleware check but be rejected by the layout, so the
// page shell still never renders for a non-admin.
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "===".slice((payload.length + 3) % 4);
    const json = atob(padded);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Generate a unique nonce for every page request.
  // Next.js App Router reads the x-nonce request header and stamps it on all
  // inline <script> tags it generates, so we can drop 'unsafe-inline' entirely.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
  const isDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    // 'strict-dynamic' trusts scripts loaded by a nonced script, covering
    // Next.js chunk loading without needing an allowlist.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Inline styles are safe (they can't steal data or execute code).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: http:",
    `connect-src 'self' ${apiUrl}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    isDev ? "" : "upgrade-insecure-requests",
  ]
    .filter(Boolean)
    .join("; ");

  const isPublicOverride = PUBLIC_OVERRIDES.some((route) =>
    pathname.startsWith(route)
  );
  const isProtected =
    !isPublicOverride &&
    PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
  const isAdminRoute = pathname.startsWith("/admin");

  if (isProtected) {
    const token = request.cookies.get("access_token")?.value;
    if (!token) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(loginUrl);
      redirectResponse.headers.set("Content-Security-Policy", csp);
      return redirectResponse;
    }

    if (isAdminRoute) {
      const claims = decodeJwtPayload(token);
      const role = typeof claims?.role === "string" ? claims.role : "user";
      if (!ADMIN_ROLES.has(role)) {
        const homeUrl = new URL("/", request.url);
        const redirectResponse = NextResponse.redirect(homeUrl);
        redirectResponse.headers.set("Content-Security-Policy", csp);
        return redirectResponse;
      }
    }
  }

  // Forward nonce to server components so Next.js can stamp it on inline scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
