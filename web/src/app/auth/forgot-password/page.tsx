"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
    } catch {
      // always show success to prevent email enumeration
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center p-8">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="text-4xl">📬</div>
          <h1 className="text-2xl font-semibold">Check your email</h1>
          <p className="text-gray-400">
            If an account with <strong className="text-white">{email}</strong> exists,
            we sent a password reset link. Check your inbox.
          </p>
          <Link href="/auth/login" className="block text-sm text-white hover:underline mt-4">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-57px)] items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="text-gray-400 text-sm mt-2">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-white"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-amber-500 text-black rounded-lg font-semibold hover:bg-amber-400 transition disabled:opacity-50"
          >
            {loading ? "Sending…" : "Send reset link"}
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
