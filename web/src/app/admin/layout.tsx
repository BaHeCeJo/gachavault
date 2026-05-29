import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Server-side admin gate. Every page under /admin/* renders inside this
// layout, so an unauthenticated or non-admin user can never reach the page
// shell — even with a forged JWT (the middleware decodes claims without
// verifying the signature, which is fine for UX routing but is not a security
// boundary). The real verification happens here by calling auth-service's
// /auth/me, which validates the JWT signature server-side.
//
// We keep the API call out of the middleware because middleware runs on every
// request including static assets and prefetches; doing the round-trip only
// for /admin/* layout renders avoids hammering auth-service.
const API_BASE =
  process.env.INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3000";

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

async function fetchRole(cookieHeader: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: { cookie: cookieHeader, accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { role?: string } };
    return json?.data?.role ?? null;
  } catch {
    return null;
  }
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  if (!cookieHeader) {
    redirect("/auth/login?redirect=/admin");
  }

  const role = await fetchRole(cookieHeader);
  if (!role) {
    redirect("/auth/login?redirect=/admin");
  }
  if (!ADMIN_ROLES.has(role)) {
    redirect("/");
  }

  return <>{children}</>;
}
