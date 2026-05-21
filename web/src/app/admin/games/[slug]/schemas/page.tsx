"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi, gamesApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Section { id: string; slug: string; name: string }
interface Schema {
  id: string;
  section_id: string | null;
  name: string;
  fields: Record<string, unknown>;
  created_at: string;
}

const DEFAULT_FIELDS = JSON.stringify(
  [{ key: "description", label: "Description", type: "text" }],
  null,
  2
);

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; schema: Schema }
  | null;

export default function AdminGameSchemasPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [gameName, setGameName] = useState(slug);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState({ name: "", section_id: "", fields: DEFAULT_FIELDS });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Schema | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.replace(`/auth/login?redirect=/admin/games/${slug}/schemas`);
  }, [isLoading, user, router, slug]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      gamesApi.get(slug),
      gamesApi.getSections(slug),
      adminApi.games.listSchemas(slug),
    ])
      .then(([gameRes, sectRes, schemaRes]) => {
        setGameName(gameRes.data.data.name);
        setSections(sectRes.data.data ?? []);
        setSchemas(schemaRes.data.data ?? []);
      })
      .finally(() => setLoading(false));
  }, [user, slug]);

  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? "—";

  const openCreate = () => {
    setForm({ name: "", section_id: "", fields: DEFAULT_FIELDS });
    setError("");
    setModal({ mode: "create" });
  };

  const openEdit = (schema: Schema) => {
    setForm({
      name: schema.name,
      section_id: schema.section_id ?? "",
      fields: JSON.stringify(schema.fields, null, 2),
    });
    setError("");
    setModal({ mode: "edit", schema });
  };

  const save = async () => {
    if (!form.name.trim()) { setError("Name is required"); return; }
    let parsedFields: unknown;
    try {
      parsedFields = JSON.parse(form.fields);
    } catch {
      setError("Fields must be valid JSON");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        const res = await adminApi.games.createSchema(slug, {
          name: form.name,
          section_id: form.section_id || null,
          fields: parsedFields,
        });
        setSchemas((prev) => [...prev, res.data.data]);
      } else if (modal?.mode === "edit") {
        const res = await adminApi.games.updateSchema(slug, modal.schema.id, {
          name: form.name,
          fields: parsedFields,
        });
        setSchemas((prev) => prev.map((s) => (s.id === modal.schema.id ? res.data.data : s)));
      }
      setModal(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteSchema = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.games.deleteSchema(slug, deleteTarget.id);
      setSchemas((prev) => prev.filter((s) => s.id !== deleteTarget.id));
    } catch {
      setError("Failed to delete schema");
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
    <main className="max-w-4xl mx-auto px-6 py-10">
      <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
        <Link href="/admin" className="hover:text-white">Admin</Link>
        <span>/</span>
        <Link href="/admin/games" className="hover:text-white">Games</Link>
        <span>/</span>
        <Link href={`/admin/games/${slug}/sections`} className="hover:text-white">{gameName}</Link>
        <span>/</span>
        <span className="text-white">Schemas</span>
      </div>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Item Schemas</h1>
          <p className="text-gray-400 text-sm mt-1">
            Schemas define what fields items in each section have.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
        >
          + Add Schema
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : schemas.length === 0 ? (
        <p className="text-gray-400">
          No schemas yet. Create a schema before adding items — items require a
          <code className="mx-1 px-1 bg-gray-800 rounded text-xs">type_schema_id</code>
          to define their fields.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Section</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Fields</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium w-48">ID</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {schemas.map((s) => (
                <tr key={s.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-gray-400">{sectionName(s.section_id)}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {Array.isArray(s.fields)
                      ? `${s.fields.length} field${s.fields.length !== 1 ? "s" : ""}`
                      : "custom"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 truncate max-w-0 w-48">
                    {s.id}
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
                        onClick={() => setDeleteTarget(s)}
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

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete schema"
        description={`Delete schema "${deleteTarget?.name}"? Items using it will lose their type reference.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteSchema}
        onCancel={() => setDeleteTarget(null)}
      />

      {modal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[520px] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-lg">
              {modal.mode === "create" ? "Add Schema" : "Edit Schema"}
            </h2>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Character Schema"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>

            {modal.mode === "create" && (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Section (optional)</label>
                <select
                  value={form.section_id}
                  onChange={(e) => setForm((f) => ({ ...f, section_id: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                >
                  <option value="">— All sections —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-xs text-gray-400 block mb-1">Fields (JSON array)</label>
              <textarea
                rows={8}
                value={form.fields}
                onChange={(e) => setForm((f) => ({ ...f, fields: e.target.value }))}
                spellCheck={false}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs font-mono focus:outline-none focus:border-white resize-none"
              />
              <p className="text-gray-600 text-xs mt-1">
                Types: <code>text</code>, <code>number</code>, <code>url</code>, <code>textarea</code>, <code>select</code>, <code>attribute</code>, <code>date</code>,{" "}
                <code>itemref</code>, <code>itemlist</code> (add <code>item_section</code> + optional <code>qty_range: true</code>),{" "}
                <code>resistances</code> (add <code>attribute_type</code> to set which attributes define the rows)
              </p>
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
