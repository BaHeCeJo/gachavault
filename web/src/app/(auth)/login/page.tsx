"use client";

import { useState } from "react";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: call POST /api/v1/auth/login via api client
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sign in to GachaVault</h1>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-white"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 focus:outline-none focus:border-white"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2 bg-white text-black rounded-lg font-semibold hover:bg-gray-200 transition"
          >
            Sign in
          </button>
        </form>
        <p className="text-center text-sm text-gray-400">
          No account?{" "}
          <Link href="/auth/register" className="text-white hover:underline">
            Create one
          </Link>
        </p>
        <p className="text-center text-sm">
          <Link href="/auth/forgot-password" className="text-gray-400 hover:text-white">
            Forgot password?
          </Link>
        </p>
      </div>
    </main>
  );
}
