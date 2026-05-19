"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setTokens } from "@/lib/auth";

function GoogleCallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const access_token = searchParams.get("access_token");
    const refresh_token = searchParams.get("refresh_token");
    const error = searchParams.get("error");

    if (error || !access_token || !refresh_token) {
      router.replace(`/auth/login?error=${error ?? "oauth_failed"}`);
      return;
    }

    setTokens(access_token, refresh_token);
    router.replace("/");
  }, [searchParams, router]);

  return (
    <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
      <p className="text-gray-400 animate-pulse">Signing you in…</p>
    </main>
  );
}

export default function GoogleCallbackPage() {
  return (
    <Suspense>
      <GoogleCallbackContent />
    </Suspense>
  );
}
