"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi, gamesApi, usersApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Avatar } from "@/components/Avatar";

interface UserInfo {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  role: string;
  email_verified: boolean;
  provider: string;
  created_at: string;
}

interface Game {
  id: string;
  slug: string;
  name: string;
}

interface GameRole {
  game_id: string;
  section_id: string | null;
  role: string;
  granted_at: string;
}

const GAME_ROLES = ["game_admin", "game_editor", "section_editor", "contributor"] as const;
const ROLE_LABELS: Record<string, string> = {
  game_admin:     "Game Admin",
  game_editor:    "Game Editor",
  section_editor: "Section Editor",
  contributor:    "Contributor",
};
const ROLE_COLORS: Record<string, string> = {
  game_admin:     "text-red-400 border-red-800",
  game_editor:    "text-blue-400 border-blue-800",
  section_editor: "text-cyan-400 border-cyan-800",
  contributor:    "text-green-400 border-green-800",
};

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: me, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserInfo | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [gameRoles, setGameRoles] = useState<GameRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!authLoading && !me) router.replace("/auth/login");
  }, [authLoading, me, router]);

  useEffect(() => {
    if (!me) return;
    Promise.all([
      usersApi.list(),
      gamesApi.list(true),
      adminApi.users.listGameRoles(id),
    ]).then(([usersRes, gamesRes, rolesRes]) => {
      const found = (usersRes.data.data ?? []).find((u: UserInfo) => u.id === id);
      setProfile(found ?? null);
      setGames(gamesRes.data.data ?? []);
      setGameRoles(rolesRes.data.data ?? []);
    }).finally(() => setLoading(false));
  }, [me, id]);

  const getRoleForGame = (gameId: string) =>
    gameRoles.find((r) => r.game_id === gameId && !r.section_id)?.role ?? "";

  const handleRoleChange = async (gameId: string, role: string) => {
    setSaving(gameId);
    try {
      if (!role) {
        await adminApi.users.removeGameRole(id, gameId);
        setGameRoles((prev) => prev.filter((r) => r.game_id !== gameId));
      } else {
        await adminApi.users.setGameRole(id, gameId, role);
        setGameRoles((prev) => {
          const without = prev.filter((r) => !(r.game_id === gameId && !r.section_id));
          return [...without, { game_id: gameId, section_id: null, role, granted_at: new Date().toISOString() }];
        });
      }
    } catch {
      alert("Failed to update game role");
    } finally {
      setSaving(null);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="h-24 rounded-xl bg-gray-800 animate-pulse mb-4" />
        <div className="h-64 rounded-xl bg-gray-800 animate-pulse" />
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-red-400">User not found.</p>
        <Link href="/admin/users" className="text-sm text-gray-400 hover:text-white mt-2 inline-block">← Back</Link>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-white">Admin</Link>
        <span>/</span>
        <Link href="/admin/users" className="hover:text-white">Users</Link>
        <span>/</span>
        <span className="text-white">{profile.username}</span>
      </div>

      {/* Profile header */}
      <div className="flex items-center gap-5 rounded-xl border border-gray-800 bg-gray-900 p-6">
        <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{profile.username}</h1>
          <p className="text-gray-400 text-sm">{profile.email}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
            <span>Global role: <span className="text-white capitalize">{profile.role}</span></span>
            <span>·</span>
            <span>{profile.email_verified ? "Verified" : "Unverified"}</span>
            <span>·</span>
            <span>Joined {new Date(profile.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      {/* Per-game roles */}
      <section>
        <h2 className="text-lg font-semibold mb-1">Game Roles</h2>
        <p className="text-sm text-gray-400 mb-4">
          Assign per-game permissions. These override the default &quot;user&quot; role for specific games.
          Global admins already have full access everywhere.
        </p>

        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400">Game</th>
                <th className="text-left px-4 py-3 text-gray-400">Role</th>
                <th className="text-right px-4 py-3 text-gray-400 w-28">Action</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const current = getRoleForGame(game.id);
                const pending = pendingRoles[game.id] ?? current;
                const changed = pending !== current;
                const isSaving = saving === game.id;
                return (
                  <tr key={game.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                    <td className="px-4 py-3">{game.name}</td>
                    <td className="px-4 py-3">
                      <select
                        value={pending}
                        disabled={isSaving}
                        onChange={(e) =>
                          setPendingRoles((prev) => ({ ...prev, [game.id]: e.target.value }))
                        }
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs focus:outline-none focus:border-white disabled:opacity-50"
                      >
                        <option value="">— none —</option>
                        {GAME_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                      {current && !changed && (
                        <span className={`ml-2 text-xs px-2 py-0.5 rounded border ${ROLE_COLORS[current] ?? "text-gray-400 border-gray-700"}`}>
                          {ROLE_LABELS[current] ?? current}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {changed && (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() =>
                              setPendingRoles((prev) => { const n = { ...prev }; delete n[game.id]; return n; })
                            }
                            className="text-xs text-gray-400 hover:text-white"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              handleRoleChange(game.id, pending);
                              setPendingRoles((prev) => { const n = { ...prev }; delete n[game.id]; return n; });
                            }}
                            disabled={isSaving}
                            className="text-xs px-3 py-1 bg-white text-black rounded hover:bg-gray-200 disabled:opacity-50"
                          >
                            {isSaving ? "Saving…" : "Save"}
                          </button>
                        </div>
                      )}
                      {!changed && current && (
                        <button
                          onClick={() => handleRoleChange(game.id, "")}
                          disabled={isSaving}
                          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Role legend */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h3 className="text-sm font-semibold mb-3 text-gray-300">Role Reference</h3>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {GAME_ROLES.map((r) => (
            <div key={r}>
              <dt className={`inline-block px-2 py-0.5 rounded border mb-0.5 ${ROLE_COLORS[r]}`}>
                {ROLE_LABELS[r]}
              </dt>
              <dd className="text-gray-400">
                {r === "game_admin" && "Full control of one game — create, edit, delete items and schemas"}
                {r === "game_editor" && "Add and edit items within a specific game (no delete)"}
                {r === "section_editor" && "Add and edit items within one section of a game"}
                {r === "contributor" && "Submit items for review (not yet enforced)"}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
