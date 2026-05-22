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
