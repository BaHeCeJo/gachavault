const ACCESS_TOKEN_KEY = "gv_access_token";
const REFRESH_TOKEN_KEY = "gv_refresh_token";

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  email_verified: boolean;
  provider: string;
  role: string;
  created_at: string;
}

export function isAdmin(user: User | null): boolean {
  return user?.role === "admin" || user?.role === "superadmin";
}

export function canEdit(user: User | null): boolean {
  return user?.role === "admin" || user?.role === "superadmin" || user?.role === "editor";
}
