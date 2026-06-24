"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";
import { Avatar } from "./Avatar";
import { isAdmin } from "@/lib/auth";

function NavLink({ href, children, onClick }: { href: string; children: React.ReactNode; onClick?: () => void }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`transition ${active ? "text-white" : "text-gray-400 hover:text-white"}`}
    >
      {children}
    </Link>
  );
}

export function Navbar() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    router.push("/");
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-800 bg-background/80 backdrop-blur-md px-4 sm:px-6 py-3">
      <nav className="max-w-7xl mx-auto flex items-center justify-between">
        <Link href="/" onClick={closeMenu} className="text-xl font-semibold tracking-tight">
          <span className="text-amber-400">H</span>otarumi
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          <LanguageSwitcher />
          <NavLink href="/games">Games</NavLink>
          <NavLink href="/calendar">Calendar</NavLink>
          <NavLink href="/collections">Collection</NavLink>
          <NavLink href="/tierlists">Tier Lists</NavLink>
          <NavLink href="/search">Search</NavLink>

          {!isLoading && (
            <>
              {user ? (
                <>
                  {isAdmin(user) && <NavLink href="/admin">Admin</NavLink>}
                  <div className="flex items-center gap-3 ml-2">
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 hover:opacity-80 transition"
                    >
                      <Avatar username={user.username} avatarUrl={user.avatar_url} size={28} />
                      <span className="text-white">{user.username}</span>
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
                    className="px-4 py-2 bg-amber-500 text-black rounded-md text-sm hover:bg-amber-400 transition shadow-sm shadow-amber-500/20"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="md:hidden flex items-center justify-center w-11 h-11 -mr-2 rounded-md text-gray-300 hover:text-white hover:bg-gray-800/60 transition"
        >
          {menuOpen ? (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          ) : (
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </nav>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden absolute left-0 right-0 top-full border-b border-gray-800 bg-background/95 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1 text-base">
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-xs uppercase tracking-wider text-gray-500">Language</span>
              <LanguageSwitcher />
            </div>
            <div className="h-px bg-gray-800 my-1" />
            <NavLink href="/games" onClick={closeMenu}>
              <span className="block px-2 py-3">Games</span>
            </NavLink>
            <NavLink href="/calendar" onClick={closeMenu}>
              <span className="block px-2 py-3">Calendar</span>
            </NavLink>
            <NavLink href="/collections" onClick={closeMenu}>
              <span className="block px-2 py-3">Collection</span>
            </NavLink>
            <NavLink href="/tierlists" onClick={closeMenu}>
              <span className="block px-2 py-3">Tier Lists</span>
            </NavLink>
            <NavLink href="/search" onClick={closeMenu}>
              <span className="block px-2 py-3">Search</span>
            </NavLink>
            {!isLoading && user && isAdmin(user) && (
              <NavLink href="/admin" onClick={closeMenu}>
                <span className="block px-2 py-3">Admin</span>
              </NavLink>
            )}
            <div className="h-px bg-gray-800 my-1" />
            {!isLoading && (
              user ? (
                <>
                  <Link
                    href="/profile"
                    onClick={closeMenu}
                    className="flex items-center gap-3 px-2 py-3 text-gray-300 hover:text-white transition"
                  >
                    <Avatar username={user.username} avatarUrl={user.avatar_url} size={32} />
                    <span className="text-white">{user.username}</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="text-left px-2 py-3 text-gray-400 hover:text-white transition"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-2 px-2 py-2">
                  <Link
                    href="/auth/login"
                    onClick={closeMenu}
                    className="block w-full text-center py-3 border border-gray-700 rounded-md text-gray-300 hover:text-white hover:border-gray-500 transition"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/auth/register"
                    onClick={closeMenu}
                    className="block w-full text-center py-3 bg-amber-500 text-black rounded-md hover:bg-amber-400 transition"
                  >
                    Sign up
                  </Link>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </header>
  );
}
