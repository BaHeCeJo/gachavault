"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi, gamesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface Section { id: string; slug: string; name: string; order: number; tabs?: string[] }

const ALL_TABS = [
  { key: "skills",    label: "Skills / Abilities" },
  { key: "builds",    label: "Builds" },
  { key: "changelog", label: "Changelog" },
];

const DEFAULT_TABS = ["skills", "changelog"];

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; section: Section }
  | null;

export default function AdminGameSectionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [sections, setSections] = useState<Section[]>([]);
  const [gameName, setGameName] = useState(slug);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState({ slug: "", name: "", order: "0", tabs: DEFAULT_TABS });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.replace(`/auth/login?redirect=/admin/games/${slug}/sections`);
  }, [isLoading, user, router, slug]);

  useEffect(() => {
    if (!user) return;
    Promise.all([gamesApi.get(slug), gamesApi.getSections(slug)])
      .then(([gameRes, sectRes]) => {
        setGameName(gameRes.data.data.name);
        setSections(sectRes.data.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [user, slug]);

  const openCreate = () => {
    setForm({ slug: "", name: "", order: "0", tabs: DEFAULT_TABS });
    setError("");
    setModal({ mode: "create" });
  };

  const openEdit = (section: Section) => {
    setForm({
      slug: section.slug,
      name: section.name,
      order: String(section.order),
      tabs: section.tabs ?? DEFAULT_TABS,
    });
    setError("");
    setModal({ mode: "edit", section });
  };

  const save = async () => {
    if (modal?.mode === "create" && !form.slug.trim()) { setError("Slug is required"); return; }
    if (!form.name.trim()) { setError("Name is required"); return; }
    setError("");
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        const res = await adminApi.games.createSection(slug, {
          slug: form.slug,
          name: form.name,
          order: parseInt(form.order) || 0,
        });
        setSections((prev) => [...prev, res.data.data].sort((a, b) => a.order - b.order));
      } else if (modal?.mode === "edit") {
        const res = await adminApi.games.updateSection(slug, modal.section.id, {
          name: form.name,
          order: parseInt(form.order) || 0,
          tabs: form.tabs,
        });
        setSections((prev) =>
          prev.map((s) => (s.id === modal.section.id ? res.data.data : s))
            .sort((a, b) => a.order - b.order)
        );
      }
      setModal(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (section: Section) => {
    if (!confirm(`Delete section "${section.name}"? Items in this section will lose their section reference.`)) return;
    try {
      await adminApi.games.deleteSection(slug, section.id);
      setSections((prev) => prev.filter((s) => s.id !== section.id));
    } catch {
      alert("Failed to delete section");
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
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-white">Admin</Link>
        <span>/</span>
        <Link href="/admin/games" className="hover:text-white">Games</Link>
        <span>/</span>
        <span className="text-white">{gameName}</span>
      </div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Sections</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
        >
          + Add Section
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <p className="text-gray-400">No sections yet. Sections group items (e.g. Characters, Weapons, Artifacts).</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Slug</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Order</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Tabs</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {sections.map((s) => (
                <tr key={s.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono">{s.slug}</td>
                  <td className="px-4 py-3 text-gray-500">{s.order}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {(s.tabs ?? DEFAULT_TABS).join(", ")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => openEdit(s)}
                        className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteSection(s)}
                        className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-red-900 text-red-400 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-96 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-lg">
              {modal.mode === "create" ? "Add Section" : "Edit Section"}
            </h2>

            {modal.mode === "create" && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Slug</label>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="e.g. characters"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Characters"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Display order</label>
              <input
                type="number"
                value={form.order}
                onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <p className="text-xs text-gray-400 mb-2">Tabs shown on item pages</p>
              <div className="space-y-1.5">
                {ALL_TABS.map((tab) => (
                  <label key={tab.key} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={form.tabs.includes(tab.key)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          tabs: e.target.checked
                            ? [...f.tabs, tab.key]
                            : f.tabs.filter((t) => t !== tab.key),
                        }))
                      }
                    />
                    {tab.label}
                  </label>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
              >
                {saving ? "Saving…" : modal.mode === "create" ? "Create" : "Save"}
              </button>
              <button
                onClick={() => setModal(null)}
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
