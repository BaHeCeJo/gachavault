"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi, usersApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";

interface User {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  email_verified: boolean;
  provider: string;
  role: string;
  created_at: string;
}

const ROLES = ["user", "editor", "admin", "superadmin"] as const;

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  user:       { label: "User",       color: "text-gray-400 border-gray-700" },
  editor:     { label: "Editor",     color: "text-blue-400 border-blue-800" },
  admin:      { label: "Admin",      color: "text-purple-400 border-purple-800" },
  superadmin: { label: "Superadmin", color: "text-red-400 border-red-800" },
};

export default function AdminUsersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [savingRole, setSavingRole] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login?redirect=/admin/users");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    usersApi
      .list()
      .then((res) => setUsers(res.data.data ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setSavingRole(userId);
    try {
      await adminApi.users.setRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
    } catch {
      alert("Failed to update role");
    } finally {
      setSavingRole(null);
    }
  };

  const filtered = users.filter(
    (u) =>
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-white">Admin</Link>
        <span>/</span>
        <span className="text-white">Users</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-semibold">Users</h1>
        <span className="text-gray-400 text-sm">{users.length} total</span>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by username or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 w-10" />
                <th className="text-left px-4 py-3 text-gray-400">Username</th>
                <th className="text-left px-4 py-3 text-gray-400">Email</th>
                <th className="text-left px-4 py-3 text-gray-400">Provider</th>
                <th className="text-left px-4 py-3 text-gray-400">Verified</th>
                <th className="text-left px-4 py-3 text-gray-400">Role</th>
                <th className="text-left px-4 py-3 text-gray-400">Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    {search ? "No users match your search." : "No users yet."}
                  </td>
                </tr>
              ) : (
                filtered.map((u) => {
                  const roleInfo = ROLE_LABELS[u.role] ?? ROLE_LABELS.user;
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                      <td className="px-4 py-3">
                        <Avatar username={u.username} avatarUrl={u.avatar_url} size={32} />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/users/${u.id}`} className="hover:text-white hover:underline">
                          {u.username}
                        </Link>
                        {isSelf && <span className="ml-2 text-xs text-gray-500">(you)</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs border border-gray-700 capitalize">
                          {u.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${u.email_verified ? "text-green-400" : "text-yellow-400"}`}>
                          {u.email_verified ? "Yes" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className={`text-xs px-2 py-1 rounded border ${roleInfo.color}`}>
                            {roleInfo.label}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            disabled={savingRole === u.id}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-white disabled:opacity-50"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r].label}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
