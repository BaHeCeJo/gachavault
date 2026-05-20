"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { tierlistsApi, gamesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Game { id: string; slug: string; name: string }
interface Section { id: string; slug: string; name: string }
interface TierList {
  id: string;
  game_id: string;
  title: string;
  is_public: boolean;
  share_slug: string;
  updated_at: string;
}

export default function TierListsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [tierlists, setTierlists] = useState<TierList[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<Section[]>([]);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newGameId, setNewGameId] = useState("");
  const [newSectionId, setNewSectionId] = useState("");
  const [newPublic, setNewPublic] = useState(true);
  const [createError, setCreateError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login?redirect=/tierlists");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([tierlistsApi.list(), gamesApi.list()])
      .then(([tlRes, gRes]) => {
        setTierlists(tlRes.data.data ?? []);
        const gs: Game[] = gRes.data.data ?? [];
        setGames(gs);
        if (gs.length > 0) setNewGameId(gs[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (!newGameId) { setSections([]); setNewSectionId(""); return; }
    const game = games.find((g) => g.id === newGameId);
    if (!game) return;
    gamesApi.getSections(game.slug).then((res) => {
      const sects: Section[] = res.data.data ?? [];
      setSections(sects);
      setNewSectionId("");
    }).catch(() => setSections([]));
  }, [newGameId, games]);

  const createTierList = async () => {
    if (!newTitle.trim()) { setCreateError("Title is required"); return; }
    if (!newGameId) { setCreateError("Select a game"); return; }
    setCreateError("");
    try {
      const payload: Record<string, unknown> = { title: newTitle, game_id: newGameId, is_public: newPublic };
      if (newSectionId) payload.section_id = newSectionId;
      const res = await tierlistsApi.create(payload);
      const created: { id: string } = res.data.data;
      router.push(`/tierlists/${created.id}`);
    } catch {
      setCreateError("Failed to create tier list");
    }
  };

  const confirmDeleteTierList = async () => {
    if (!deleteTarget) return;
    await tierlistsApi.delete(deleteTarget);
    setTierlists((prev) => prev.filter((t) => t.id !== deleteTarget));
    setDeleteTarget(null);
  };

  const gameMap = new Map(games.map((g) => [g.id, g.name]));

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">My Tier Lists</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
        >
          + New Tier List
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : tierlists.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 mb-4">No tier lists yet.</p>
          <button
            onClick={() => setCreating(true)}
            className="px-6 py-3 border border-gray-700 rounded-lg text-sm hover:border-white transition"
          >
            Create your first tier list
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tierlists.map((tl) => (
            <div
              key={tl.id}
              className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-600 transition"
            >
              <Link href={`/tierlists/${tl.id}`} className="flex-1 min-w-0">
                <p className="font-medium truncate">{tl.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {gameMap.get(tl.game_id) ?? tl.game_id} ·{" "}
                  {tl.is_public ? (
                    <span className="text-green-400">Public</span>
                  ) : (
                    <span className="text-gray-500">Private</span>
                  )}{" "}
                  · {new Date(tl.updated_at).toLocaleDateString()}
                </p>
              </Link>
              <div className="flex gap-2 flex-shrink-0">
                {tl.is_public && (
                  <Link
                    href={`/tierlists/share/${tl.share_slug}`}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-white transition"
                  >
                    Share link
                  </Link>
                )}
                <Link
                  href={`/tierlists/${tl.id}`}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-white transition"
                >
                  Edit
                </Link>
                <button
                  onClick={() => setDeleteTarget(tl.id)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-red-900 text-red-400 transition"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete tier list"
        description="Delete this tier list? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteTierList}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Create modal */}
      {creating && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setCreating(false)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-lg">New Tier List</h2>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Title</label>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createTierList()}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                placeholder="My tier list"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Game</label>
              <select
                value={newGameId}
                onChange={(e) => setNewGameId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              >
                {games.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            {sections.length > 0 && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Section (optional)</label>
                <select
                  value={newSectionId}
                  onChange={(e) => setNewSectionId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                >
                  <option value="">All sections</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={newPublic}
                onChange={(e) => setNewPublic(e.target.checked)}
                className="rounded"
              />
              Make public (shareable)
            </label>
            {createError && <p className="text-red-400 text-sm">{createError}</p>}
            <div className="flex gap-3 pt-1">
              <button
                onClick={createTierList}
                className="flex-1 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 transition"
              >
                Create
              </button>
              <button
                onClick={() => setCreating(false)}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-sm hover:border-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
