"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";

function ResetPasswordContent() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!token) {
      setError("Invalid or missing reset token");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await authApi.resetPassword(token, password);
      router.push("/auth/login?reset=1");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Reset failed — the link may have expired";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-57px)] items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Choose a new password</h1>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-900/40 border border-red-700 text-red-300 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-500 transition disabled:opacity-50"
          >
            {loading ? "Updating…" : "Set new password"}
          </button>
        </form>

        <p className="text-center text-sm">
          <Link href="/auth/login" className="text-gray-400 hover:text-white">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
