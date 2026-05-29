"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { adminApi, gamesApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { extractApiError } from "@/lib/errors";
import ImageUploadField from "@/components/ImageUploadField";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { revalidateGame } from "@/lib/revalidate";

interface GameAttribute {
  id: string;
  game_id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
  sort_order: number;
}

type ModalState =
  | { mode: "create"; prefillType?: string }
  | { mode: "edit"; attr: GameAttribute }
  | null;

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function AdminAttributesPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading } = useAdminGuard(`/admin/games/${slug}/attributes`);

  const [gameName, setGameName] = useState(slug);
  const [attributes, setAttributes] = useState<GameAttribute[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [keyLocked, setKeyLocked] = useState(false);
  const [form, setForm] = useState({
    attr_type: "",
    key: "",
    name: "",
    icon_url: "",
    color: "#888888",
    sort_order: "0",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GameAttribute | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([gamesApi.get(slug), adminApi.games.listAttributes(slug)])
      .then(([gameRes, attrRes]) => {
        setGameName(gameRes.data.data.name);
        setAttributes(attrRes.data.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [user, slug]);

  const attrTypes = Array.from(new Set(attributes.map((a) => a.attr_type)));

  const openCreate = (prefillType?: string) => {
    setForm({
      attr_type: prefillType ?? "",
      key: "",
      name: "",
      icon_url: "",
      color: "#888888",
      sort_order: "0",
    });
    setKeyLocked(false);
    setError("");
    setModal({ mode: "create", prefillType });
  };

  const openEdit = (attr: GameAttribute) => {
    setForm({
      attr_type: attr.attr_type,
      key: attr.key,
      name: attr.name,
      icon_url: attr.icon_url ?? "",
      color: attr.color ?? "#888888",
      sort_order: String(attr.sort_order),
    });
    setError("");
    setModal({ mode: "edit", attr });
  };

  const save = async () => {
    if (!form.attr_type.trim()) { setError("Type is required"); return; }
    if (!form.key.trim() && modal?.mode === "create") { setError("Key is required"); return; }
    if (!form.name.trim()) { setError("Name is required"); return; }
    setError("");
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        const res = await adminApi.games.createAttribute(slug, {
          attr_type: form.attr_type.trim(),
          key: form.key.trim(),
          name: form.name.trim(),
          icon_url: form.icon_url || null,
          color: form.color || null,
          sort_order: parseInt(form.sort_order) || 0,
        });
        setAttributes((prev) => [...prev, res.data.data].sort(sortAttrs));
      } else if (modal?.mode === "edit") {
        const res = await adminApi.games.updateAttribute(slug, modal.attr.id, {
          name: form.name.trim(),
          icon_url: form.icon_url || null,
          color: form.color || null,
          sort_order: parseInt(form.sort_order) || 0,
        });
        setAttributes((prev) =>
          prev.map((a) => (a.id === modal.attr.id ? res.data.data : a)).sort(sortAttrs)
        );
      }
      revalidateGame(slug);
      setModal(null);
    } catch (e: unknown) {
      setError(extractApiError(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteAttr = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.games.deleteAttribute(slug, deleteTarget.id);
      setAttributes((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      revalidateGame(slug);
    } catch {
      setError("Failed to delete attribute");
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
    <main className="max-w-3xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-white">Admin</Link>
        <span>/</span>
        <Link href="/admin/games" className="hover:text-white">Games</Link>
        <span>/</span>
        <span className="text-white">{gameName}</span>
        <span>/</span>
        <span className="text-white">Attributes</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-semibold">Attributes</h1>
        <button
          onClick={() => openCreate()}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
        >
          + New Attribute
        </button>
      </div>
      <p className="text-gray-400 text-sm mb-8">
        Game-wide property values (paths, elements, weapon types…). Schema fields of type
        <code className="ml-1 text-gray-300">&quot;attribute&quot;</code> reference these by key.
      </p>

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-gray-800 animate-pulse" />)}
        </div>
      ) : attrTypes.length === 0 ? (
        <p className="text-gray-400">No attributes yet. Add paths, elements, weapon types, etc.</p>
      ) : (
        <div className="space-y-8">
          {attrTypes.map((type) => {
            const group = attributes.filter((a) => a.attr_type === type);
            return (
              <div key={type}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold capitalize text-gray-200">{type}</h2>
                  <button
                    onClick={() => openCreate(type)}
                    className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                  >
                    + Add value
                  </button>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 bg-gray-900">
                        <th className="text-left px-4 py-2 text-gray-400 w-8" />
                        <th className="text-left px-4 py-2 text-gray-400">Name</th>
                        <th className="text-left px-4 py-2 text-gray-400">Key</th>
                        <th className="text-left px-4 py-2 text-gray-400">Color</th>
                        <th className="text-left px-4 py-2 text-gray-400">Order</th>
                        <th className="px-4 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((a) => (
                        <tr key={a.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                          <td className="px-4 py-2">
                            {a.icon_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={a.icon_url} alt={a.name} className="w-7 h-7 object-contain" />
                            ) : (
                              <div
                                className="w-7 h-7 rounded-full"
                                style={{ backgroundColor: a.color ?? "#888" }}
                              />
                            )}
                          </td>
                          <td className="px-4 py-2">{a.name}</td>
                          <td className="px-4 py-2 text-gray-400 font-mono text-xs">{a.key}</td>
                          <td className="px-4 py-2">
                            {a.color && (
                              <span className="flex items-center gap-2">
                                <span
                                  className="w-4 h-4 rounded-full border border-gray-700 inline-block"
                                  style={{ backgroundColor: a.color }}
                                />
                                <span className="text-gray-500 text-xs font-mono">{a.color}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{a.sort_order}</td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => openEdit(a)}
                                className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeleteTarget(a)}
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
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete attribute"
        description={`Delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteAttr}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[420px] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-lg">
              {modal.mode === "create" ? "New Attribute Value" : `Edit — ${modal.attr.name}`}
            </h2>

            {/* attr_type — editable only on create */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Type <span className="text-gray-600">(e.g. path, element, weapon_type)</span>
              </label>
              {modal.mode === "create" ? (
                <input
                  type="text"
                  value={form.attr_type}
                  onChange={(e) => setForm((f) => ({ ...f, attr_type: slugify(e.target.value) }))}
                  placeholder="e.g. path"
                  list="existing-types"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                />
              ) : (
                <div className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-400">
                  {form.attr_type}
                </div>
              )}
              <datalist id="existing-types">
                {attrTypes.map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>

            {/* key — editable only on create */}
            {modal.mode === "create" && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-gray-400">Key <span className="text-gray-600">(e.g. the_hunt)</span></label>
                  {keyLocked
                    ? <button type="button" onClick={() => { setKeyLocked(false); setForm((f) => ({ ...f, key: slugify(f.name) })); }} className="text-xs text-amber-400 hover:text-amber-300">auto</button>
                    : <span className="text-xs text-gray-600">auto-generated</span>
                  }
                </div>
                <input
                  type="text"
                  value={form.key}
                  onChange={(e) => { setKeyLocked(true); setForm((f) => ({ ...f, key: slugify(e.target.value) })); }}
                  placeholder="e.g. the_hunt"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white font-mono"
                />
              </div>
            )}

            {/* name */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Display Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    key: modal.mode === "create" && !keyLocked ? slugify(name) : f.key,
                  }));
                }}
                placeholder="e.g. The Hunt"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>

            {/* icon */}
            <ImageUploadField
              label="Icon (optional)"
              value={form.icon_url}
              onChange={(url) => setForm((f) => ({ ...f, icon_url: url }))}
              placeholder="https://… or upload →"
              previewHeight="h-12"
            />

            {/* color */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="#888888"
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white"
                />
              </div>
            </div>

            {/* order */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">Display order</label>
              <input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
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

function sortAttrs(a: GameAttribute, b: GameAttribute) {
  if (a.attr_type !== b.attr_type) return a.attr_type.localeCompare(b.attr_type);
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}
