"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ImageUploadField from "@/components/ImageUploadField";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Game {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  is_active: boolean;
}

interface GameForm {
  slug: string;
  name: string;
  description: string;
  logo_url: string;
  banner_url: string;
  is_active: boolean;
}

const emptyForm = (): GameForm => ({
  slug: "", name: "", description: "", logo_url: "", banner_url: "", is_active: true,
});

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s]+/g, "-")
    .replace(/-+/g, "-");
}

export default function AdminGamesPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; game?: Game } | null>(null);
  const [form, setForm] = useState<GameForm>(emptyForm());
  const [slugLocked, setSlugLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Game | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login?redirect=/admin/games");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    adminApi.games
      .list()
      .then((r) => setGames(r.data.data ?? []))
      .finally(() => setLoading(false));
  }, [user]);

  const openCreate = () => {
    setForm(emptyForm());
    setSlugLocked(false);
    setError("");
    setModal({ mode: "create" });
  };

  const openEdit = (game: Game) => {
    setSlugLocked(true);
    setForm({
      slug: game.slug,
      name: game.name,
      description: game.description ?? "",
      logo_url: game.logo_url ?? "",
      banner_url: game.banner_url ?? "",
      is_active: game.is_active,
    });
    setError("");
    setModal({ mode: "edit", game });
  };

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const payload = {
        slug: form.slug,
        name: form.name,
        description: form.description || null,
        logo_url: form.logo_url || null,
        banner_url: form.banner_url || null,
        is_active: form.is_active,
      };
      if (modal?.mode === "create") {
        const res = await adminApi.games.create(payload);
        setGames((prev) => [...prev, res.data.data]);
      } else if (modal?.game) {
        const res = await adminApi.games.update(modal.game.slug, payload);
        setGames((prev) => prev.map((g) => (g.id === modal.game!.id ? res.data.data : g)));
      }
      setModal(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.games.delete(deleteTarget.slug);
      setGames((prev) => prev.filter((g) => g.slug !== deleteTarget.slug));
    } catch {
      setError("Failed to delete game");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← Admin</Link>
      </div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Manage Games</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
        >
          + Add Game
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <p className="text-gray-400">No games yet. Add the first one.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Slug</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                  <td className="px-4 py-3 font-medium">{g.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono">{g.slug}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded ${g.is_active ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                      {g.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <Link href={`/admin/games/${g.slug}/sections`} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">Sections</Link>
                      <Link href={`/admin/games/${g.slug}/schemas`} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">Schemas</Link>
                      <Link href={`/admin/games/${g.slug}/attributes`} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">Attributes</Link>
                      <Link href={`/admin/games/${g.slug}/translations`} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">Translations</Link>
                      <button onClick={() => openEdit(g)} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">Edit</button>
                      <button onClick={() => setDeleteTarget(g)} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-red-900 text-red-400 transition">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

      {/* Edit/Create modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setModal(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[480px] space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-lg">{modal.mode === "create" ? "Add Game" : "Edit Game"}</h2>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({ ...f, name, slug: slugLocked ? f.slug : toSlug(name) }));
                }}
                placeholder="Display name"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">Slug (URL-friendly)</label>
                {modal.mode === "create" && (
                  <span className="text-xs text-gray-500">
                    {slugLocked ? (
                      <button type="button" onClick={() => { setSlugLocked(false); setForm((f) => ({ ...f, slug: toSlug(f.name) })); }} className="text-blue-400 hover:text-blue-300">
                        reset to auto
                      </button>
                    ) : "auto from name"}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => { setSlugLocked(true); setForm((f) => ({ ...f, slug: e.target.value })); }}
                disabled={modal.mode === "edit"}
                placeholder="e.g. genshin-impact"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>
            <ImageUploadField label="Logo" value={form.logo_url} onChange={(url) => setForm((f) => ({ ...f, logo_url: url }))} placeholder="https://… or upload →" previewHeight="h-12" />
            <ImageUploadField label="Banner" value={form.banner_url} onChange={(url) => setForm((f) => ({ ...f, banner_url: url }))} placeholder="https://… or upload →" previewHeight="h-24" />
            {modal.mode === "edit" && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
                Active (visible to users)
              </label>
            )}
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                {saving ? "Saving…" : modal.mode === "create" ? "Create" : "Save"}
              </button>
              <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm hover:border-white transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete game"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
