"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import { Avatar } from "./Avatar";

export function Navbar() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="border-b border-gray-800 px-6 py-3">
      <nav className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          GachaVault
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <LanguageSwitcher />
          <Link href="/games" className="text-gray-400 hover:text-white transition">
            Games
          </Link>
          <Link href="/search" className="text-gray-400 hover:text-white transition">
            Search
          </Link>

          {!isLoading && (
            <>
              {user ? (
                <>
                  <Link href="/collections" className="text-gray-400 hover:text-white transition">
                    Collection
                  </Link>
                  <Link href="/tierlists" className="text-gray-400 hover:text-white transition">
                    Tier Lists
                  </Link>
                  <Link href="/admin" className="text-gray-400 hover:text-white transition">
                    Admin
                  </Link>
                  <div className="flex items-center gap-3 ml-2">
                    <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition">
                      <Avatar username={user.username} avatarUrl={user.avatar_url} size={28} />
                      <span className="text-white font-medium">{user.username}</span>
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="text-gray-400 hover:text-white transition"
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3 ml-2">
                  <Link href="/auth/login" className="text-gray-400 hover:text-white transition">
                    Sign in
                  </Link>
                  <Link
                    href="/auth/register"
                    className="px-4 py-1.5 bg-white text-black rounded-md font-medium text-sm hover:bg-gray-200 transition"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
