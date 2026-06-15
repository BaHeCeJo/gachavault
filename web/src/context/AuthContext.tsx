"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { authApi } from "@/lib/api";
import { User } from "@/lib/auth";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

// The auth-service sets a non-HttpOnly `logged_in` hint cookie alongside the
// real (HttpOnly) tokens. Reading it lets us skip the /auth/me probe for
// anonymous visitors — that probe would 401, trigger a /auth/refresh that also
// 401s, and spam the network tab + console on every public page load. The hint
// is advisory only: a present cookie still gets verified by /auth/me against
// the real token, and a forged one just yields a 401 we already handle.
function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith("logged_in="));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const res = await authApi.me();
      setUser(res.data.data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    // No hint cookie → definitely anonymous; resolve immediately without a
    // doomed round-trip to /auth/me + /auth/refresh.
    if (!hasSessionHint()) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login({ email, password });
    const me = await authApi.me();
    setUser(me.data.data);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore — server clears cookies regardless
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
