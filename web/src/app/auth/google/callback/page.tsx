"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

function GoogleCallbackContent() {
  const router = useRouter();
  const { refreshUser } = useAuth();

  useEffect(() => {
    refreshUser().then(() => router.replace("/"));
  }, [refreshUser, router]);

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
