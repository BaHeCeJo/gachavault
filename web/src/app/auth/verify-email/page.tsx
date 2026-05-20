"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    authApi
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center p-8">
        <div className="text-center space-y-2">
          <div className="text-2xl animate-pulse">Verifying…</div>
        </div>
      </main>
    );
  }

  if (status === "success") {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center p-8">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h1 className="text-2xl font-bold">Email verified!</h1>
          <p className="text-gray-400">Your account is now active. You can sign in.</p>
          <Link
            href="/auth/login"
            className="inline-block mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-500 transition"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-57px)] items-center justify-center p-8">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="text-4xl">❌</div>
        <h1 className="text-2xl font-bold">Verification failed</h1>
        <p className="text-gray-400">
          The link is invalid or has expired. Request a new one after signing in.
        </p>
        <Link href="/auth/login" className="block text-sm text-white hover:underline mt-4">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
