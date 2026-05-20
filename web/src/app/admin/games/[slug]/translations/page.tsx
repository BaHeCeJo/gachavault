"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { gamesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface GameInfo {
  slug: string;
  name: string;
  description?: string;
}

interface Translation {
  locale: string;
  name: string;
  description?: string;
  updated_at: string;
}

const SUPPORTED_LOCALES: Record<string, string> = {
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  ja: "日本語",
  zh: "中文",
  ko: "한국어",
  pt: "Português",
};

export default function GameTranslationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [game, setGame] = useState<GameInfo | null>(null);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/auth/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      gamesApi.get(slug as string),
      gamesApi.listTranslations(slug as string),
    ]).then(([gameRes, transRes]) => {
      setGame(gameRes.data.data);
      setTranslations(transRes.data.data ?? []);
    }).finally(() => setLoading(false));
  }, [user, slug]);

  const openEdit = (locale: string) => {
    const existing = translations.find((t) => t.locale === locale);
    setForm({
      name: existing?.name ?? "",
      description: existing?.description ?? "",
    });
    setEditing(locale);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !editing) return;
    setSaving(true);
    try {
      const res = await gamesApi.upsertTranslation(slug as string, editing, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      });
      const updated = res.data.data;
      setTranslations((prev) => {
        const without = prev.filter((t) => t.locale !== editing);
        return [...without, { locale: editing, name: updated.name, description: updated.description, updated_at: new Date().toISOString() }]
          .sort((a, b) => a.locale.localeCompare(b.locale));
      });
      setEditing(null);
    } catch {
      alert("Failed to save translation");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteTranslation = async () => {
    if (!deleteTarget) return;
    try {
      await gamesApi.deleteTranslation(slug as string, deleteTarget);
      setTranslations((prev) => prev.filter((t) => t.locale !== deleteTarget));
    } catch {
      setDeleteError("Failed to delete translation");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="h-8 rounded bg-gray-800 animate-pulse mb-4 w-48" />
        <div className="h-64 rounded-xl bg-gray-800 animate-pulse" />
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-white">Admin</Link>
        <span>/</span>
        <Link href="/admin/games" className="hover:text-white">Games</Link>
        <span>/</span>
        <Link href={`/admin/games/${slug}`} className="hover:text-white">{game?.name ?? slug}</Link>
        <span>/</span>
        <span className="text-white">Translations</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold">{game?.name} — Translations</h1>
        <p className="text-sm text-gray-400 mt-1">
          English is the canonical language. Add translations for other locales here.
        </p>
      </div>

      {/* Existing translations */}
      {translations.length > 0 && (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Locale</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">Updated</th>
                <th className="text-right px-4 py-3 w-28" />
              </tr>
            </thead>
            <tbody>
              {translations.map((t) => (
                <tr key={t.locale} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-300">
                    {t.locale}
                    <span className="ml-2 text-gray-500">{SUPPORTED_LOCALES[t.locale] ?? ""}</span>
                  </td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell">
                    {new Date(t.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => openEdit(t.locale)}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeleteTarget(t.locale)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deleteError && <p className="text-red-400 text-sm">{deleteError}</p>}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Remove translation"
        description={`Remove the ${SUPPORTED_LOCALES[deleteTarget ?? ""] ?? deleteTarget} translation? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={confirmDeleteTranslation}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Add new locale */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h2 className="text-sm font-semibold mb-4 text-gray-300">Add / Edit a Translation</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Locale</label>
            <select
              value={editing ?? ""}
              onChange={(e) => openEdit(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm w-full focus:outline-none focus:border-white"
            >
              <option value="">— select locale —</option>
              {Object.entries(SUPPORTED_LOCALES).map(([code, label]) => (
                <option key={code} value={code}>{code} — {label}</option>
              ))}
            </select>
          </div>

          {editing && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-white"
                  placeholder="Game name in this language"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-white resize-none"
                  placeholder="Short description in this language (optional)"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={!form.name.trim() || saving}
                  className="px-4 py-2 bg-white text-black text-sm font-medium rounded hover:bg-gray-200 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save translation"}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
