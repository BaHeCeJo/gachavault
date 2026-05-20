"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import { Avatar } from "./Avatar";
import { isAdmin } from "@/lib/auth";

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      className={`transition ${active ? "text-white" : "text-gray-400 hover:text-white"}`}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-background/80 backdrop-blur-md px-6 py-3">
      <nav className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-xl font-bold tracking-tight">
          <span className="text-indigo-400">H</span>otarumi
        </Link>

        <div className="flex items-center gap-6 text-sm">
          <LanguageSwitcher />
          <NavLink href="/games">Games</NavLink>
          <NavLink href="/search">Search</NavLink>

          {!isLoading && (
            <>
              {user ? (
                <>
                  <NavLink href="/collections">Collection</NavLink>
                  <NavLink href="/tierlists">Tier Lists</NavLink>
                  {isAdmin(user) && <NavLink href="/admin">Admin</NavLink>}
                  <div className="flex items-center gap-3 ml-2">
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 hover:opacity-80 transition"
                    >
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
                    className="px-4 py-1.5 bg-indigo-600 text-white rounded-md font-medium text-sm hover:bg-indigo-500 transition shadow-sm shadow-indigo-600/30"
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
