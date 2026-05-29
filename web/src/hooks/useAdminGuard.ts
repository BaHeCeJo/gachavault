"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

// Client-side guard for admin pages. The /admin/* layout already runs the
// real server-side check via auth-service /auth/me — if the user isn't
// admin/superadmin they never reach the page shell. This hook only handles
// the brief client-render window where useAuth() is still rehydrating after
// navigation: if user resolves to null we kick to login with a `redirect=`
// pointer so they land back here after signing in.
//
// Usage:
//   const { user, isLoading } = useAdminGuard("/admin/games");
//   if (isLoading || !user) return <Loading />;
export function useAdminGuard(returnTo: string) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !user) {
      router.replace(`/auth/login?redirect=${encodeURIComponent(returnTo)}`);
    }
  }, [isLoading, user, router, returnTo]);
  return { user, isLoading };
}
