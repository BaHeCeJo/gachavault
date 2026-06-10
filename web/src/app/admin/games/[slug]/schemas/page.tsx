"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { adminApi, gamesApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { extractApiError } from "@/lib/errors";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import ItemCard, { type CardLayout } from "@/components/ItemCard";
import { buildAttrMap, type GameAttribute as GameAttributeFull } from "@/lib/attrs";
import { revalidateGame } from "@/lib/revalidate";
import { type PageLayout, parsePageLayout } from "@/lib/pageLayout";
import { PageLayoutEditor } from "./_components/PageLayoutEditor";

interface Section { id: string; slug: string; name: string }
interface GameAttribute { attr_type: string }
interface Schema {
  id: string;
  section_id: string | null;
  name: string;
  fields: unknown;
  // null = auto (current behavior, all attr_types with values),
  // [] = no filters, ["path","rarity"] = only those.
  filter_attrs: string[] | null;
  card_layout: CardLayout | null;
  // Raw detail-page template JSON; round-tripped here, edited via the
  // dedicated block editor (later stage). Parsed at the edge.
  page_layout?: unknown;
  created_at: string;
}

type FieldType =
  | "text"
  | "number"
  | "url"
  | "image"
  | "textarea"
  | "select"
  | "attribute"
  | "date"
  | "itemref"
  | "itemlist"
  | "resistances"
  | "backref";

interface BackrefSource {
  source_section: string;
  source_field: string;
}

interface SchemaField {
  key: string;
  label: string;
  type: FieldType;
  attribute_type?: string;
  // Multi-value attribute: store as string[] (each entry is an attribute key)
  // so pages can render multiple pills. Only meaningful when type=attribute.
  multi?: boolean;
  item_section?: string;
  qty_range?: boolean;
  source_section?: string;
  source_field?: string;
  sources?: BackrefSource[];
  options?: string[];
}

const FIELD_TYPES: { value: FieldType; label: string; help: string }[] = [
  { value: "text", label: "Text", help: "Single-line text" },
  { value: "textarea", label: "Long text", help: "Multi-line text (description, lore)" },
  { value: "number", label: "Number", help: "Numeric value" },
  { value: "url", label: "URL", help: "External link" },
  { value: "image", label: "Image", help: "Image URL with upload widget (portrait, splash art, etc.)" },
  { value: "date", label: "Date", help: "Date value" },
  { value: "select", label: "Select", help: "Pick from a fixed list of options" },
  { value: "attribute", label: "Attribute", help: "Pill from one attribute type (e.g. element, class)" },
  { value: "itemref", label: "Item reference", help: "Link to one item in another section" },
  { value: "itemlist", label: "Item list", help: "List of items with optional quantities" },
  { value: "resistances", label: "Resistances", help: "Per-attribute resistance grid" },
  { value: "backref", label: "Back-reference", help: "Auto-resolved list of items that reference this one" },
];

const FIELD_TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label])) as Record<FieldType, string>;

const DEFAULT_FIELDS: SchemaField[] = [{ key: "description", label: "Description", type: "textarea" }];

type ModalState =
  | { mode: "create" }
  | { mode: "edit"; schema: Schema }
  | null;

function makeEmptyField(): SchemaField {
  return { key: "", label: "", type: "text" };
}

function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseFieldsValue(raw: unknown): SchemaField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => {
      const key = typeof f.key === "string" ? f.key : "";
      const label = typeof f.label === "string" ? f.label : "";
      const type = (typeof f.type === "string" ? (f.type as FieldType) : "text");
      const out: SchemaField = { key, label, type };
      if (typeof f.attribute_type === "string") out.attribute_type = f.attribute_type;
      if (typeof f.multi === "boolean") out.multi = f.multi;
      if (typeof f.item_section === "string") out.item_section = f.item_section;
      if (typeof f.qty_range === "boolean") out.qty_range = f.qty_range;
      if (typeof f.source_section === "string") out.source_section = f.source_section;
      if (typeof f.source_field === "string") out.source_field = f.source_field;
      if (Array.isArray(f.sources)) {
        out.sources = (f.sources as Record<string, unknown>[])
          .filter((s) => s && typeof s === "object")
          .map((s) => ({
            source_section: typeof s.source_section === "string" ? s.source_section : "",
            source_field: typeof s.source_field === "string" ? s.source_field : "",
          }));
      }
      if (Array.isArray(f.options)) {
        out.options = (f.options as unknown[]).filter((o): o is string => typeof o === "string");
      }
      return out;
    });
}

// Drop optional keys that don't apply to the current type so we never persist
// dangling config (e.g. an `attribute_type` left over from when the field was
// type=attribute and then switched to text).
function pruneField(f: SchemaField): SchemaField {
  const out: SchemaField = { key: f.key, label: f.label, type: f.type };
  switch (f.type) {
    case "select":
      if (f.options && f.options.length > 0) out.options = f.options;
      break;
    case "attribute":
      if (f.attribute_type) out.attribute_type = f.attribute_type;
      if (f.multi) out.multi = true;
      break;
    case "resistances":
      if (f.attribute_type) out.attribute_type = f.attribute_type;
      break;
    case "itemref":
      if (f.item_section) out.item_section = f.item_section;
      break;
    case "itemlist":
      if (f.item_section) out.item_section = f.item_section;
      if (f.qty_range) out.qty_range = true;
      break;
    case "backref": {
      const sources = (f.sources ?? []).filter((s) => s.source_section && s.source_field);
      if (sources.length === 1) {
        out.source_section = sources[0].source_section;
        out.source_field = sources[0].source_field;
      } else if (sources.length > 1) {
        out.sources = sources;
      } else if (f.source_section && f.source_field) {
        out.source_section = f.source_section;
        out.source_field = f.source_field;
      }
      break;
    }
  }
  return out;
}

export default function AdminGameSchemasPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, isLoading } = useAdminGuard(`/admin/games/${slug}/schemas`);

  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [attrTypes, setAttrTypes] = useState<string[]>([]);
  const [allAttrs, setAllAttrs] = useState<GameAttributeFull[]>([]);
  const [gameName, setGameName] = useState(slug);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);

  const [name, setName] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [fields, setFields] = useState<SchemaField[]>([]);
  // null = "auto" (show all attr_types that have values).
  // string[] = explicit allowlist of attribute-type keys.
  const [filterAttrs, setFilterAttrs] = useState<string[] | null>(null);
  // null = legacy hardcoded defaults; object = explicit per-slot config.
  const [cardLayout, setCardLayout] = useState<CardLayout | null>(null);
  // Detail-page template. Round-tripped now (preserved across saves); the
  // visual block editor lands in a later stage. null = legacy fixed page.
  const [pageLayout, setPageLayout] = useState<PageLayout | null>(null);
  const [viewMode, setViewMode] = useState<"visual" | "json">("visual");
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Schema | null>(null);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      gamesApi.get(slug),
      gamesApi.getSections(slug),
      adminApi.games.listSchemas(slug),
      gamesApi.getAttributes(slug),
    ])
      .then(([gameRes, sectRes, schemaRes, attrRes]) => {
        setGameName(gameRes.data.data.name);
        setSections(sectRes.data.data ?? []);
        setSchemas(schemaRes.data.data ?? []);
        const attrs = (attrRes.data.data ?? []) as GameAttributeFull[];
        setAllAttrs(attrs);
        const types = new Set<string>();
        for (const a of attrs as GameAttribute[]) types.add(a.attr_type);
        setAttrTypes(Array.from(types).sort());
      })
      .finally(() => setLoading(false));
  }, [user, slug]);

  const sectionName = (id: string | null) =>
    sections.find((s) => s.id === id)?.name ?? "—";

  function resetForm() {
    setName("");
    setSectionId("");
    setFields(DEFAULT_FIELDS);
    setFilterAttrs(null);
    setCardLayout(null);
    setPageLayout(null);
    setJsonDraft(JSON.stringify(DEFAULT_FIELDS, null, 2));
    setViewMode("visual");
    setJsonError("");
    setError("");
  }

  const openCreate = () => {
    resetForm();
    setModal({ mode: "create" });
  };

  const openEdit = (schema: Schema) => {
    const parsed = parseFieldsValue(schema.fields);
    setName(schema.name);
    setSectionId(schema.section_id ?? "");
    setFields(parsed);
    setFilterAttrs(Array.isArray(schema.filter_attrs) ? schema.filter_attrs : null);
    setCardLayout(schema.card_layout ?? null);
    setPageLayout(parsePageLayout(schema.page_layout));
    setJsonDraft(JSON.stringify(schema.fields, null, 2));
    setViewMode("visual");
    setJsonError("");
    setError("");
    setModal({ mode: "edit", schema });
  };

  // When switching modes, commit the source of truth in the source mode to the
  // destination mode so the user doesn't lose unsaved edits.
  function switchMode(next: "visual" | "json") {
    if (next === viewMode) return;
    if (next === "json") {
      // Visual is authoritative — serialise it.
      setJsonDraft(JSON.stringify(fields.map(pruneField), null, 2));
      setJsonError("");
    } else {
      // Promote JSON draft to visual. If it's malformed, stay in JSON mode.
      try {
        const parsed = JSON.parse(jsonDraft);
        setFields(parseFieldsValue(parsed));
        setJsonError("");
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : "Invalid JSON");
        return;
      }
    }
    setViewMode(next);
  }

  function updateField(idx: number, patch: Partial<SchemaField>) {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function removeField(idx: number) {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  }
  function moveField(idx: number, dir: -1 | 1) {
    setFields((prev) => {
      const next = idx + dir;
      if (next < 0 || next >= prev.length) return prev;
      const copy = prev.slice();
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });
  }
  function addField() {
    setFields((prev) => [...prev, makeEmptyField()]);
  }

  // Resolve the canonical fields array to ship to the API, considering which
  // mode the user is currently editing in.
  function readyFields(): SchemaField[] | null {
    if (viewMode === "json") {
      try {
        return parseFieldsValue(JSON.parse(jsonDraft));
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : "Invalid JSON");
        return null;
      }
    }
    return fields.map(pruneField);
  }

  function validate(fs: SchemaField[]): string | null {
    if (!name.trim()) return "Name is required";
    const seen = new Set<string>();
    for (const f of fs) {
      if (!f.key) return "Every field needs a key";
      if (!/^[a-z0-9_]+$/.test(f.key)) return `Key "${f.key}" must be lowercase letters, digits and underscores`;
      if (seen.has(f.key)) return `Duplicate field key: ${f.key}`;
      seen.add(f.key);
      if (!f.label) return `Field "${f.key}" needs a label`;
    }
    return null;
  }

  const save = async () => {
    const fs = readyFields();
    if (fs === null) return;
    const validationError = validate(fs);
    if (validationError) { setError(validationError); return; }
    setError("");
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        const res = await adminApi.games.createSchema(slug, {
          name,
          section_id: sectionId || null,
          fields: fs,
          filter_attrs: filterAttrs,
          card_layout: cardLayout,
          page_layout: pageLayout,
        });
        setSchemas((prev) => [...prev, res.data.data]);
      } else if (modal?.mode === "edit") {
        const res = await adminApi.games.updateSchema(slug, modal.schema.id, {
          name,
          fields: fs,
          filter_attrs: filterAttrs,
          card_layout: cardLayout,
          page_layout: pageLayout,
        });
        setSchemas((prev) => prev.map((s) => (s.id === modal.schema.id ? res.data.data : s)));
      }
      revalidateGame(slug);
      setModal(null);
    } catch (e: unknown) {
      setError(extractApiError(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteSchema = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.games.deleteSchema(slug, deleteTarget.id);
      setSchemas((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      revalidateGame(slug);
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
          <h1 className="text-3xl font-semibold">Item Schemas</h1>
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400">Name</th>
                <th className="text-left px-4 py-3 text-gray-400">Section</th>
                <th className="text-left px-4 py-3 text-gray-400">Fields</th>
                <th className="text-left px-4 py-3 text-gray-400 w-48">ID</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {schemas.map((s) => (
                <tr key={s.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                  <td className="px-4 py-3">{s.name}</td>
                  <td className="px-4 py-3 text-gray-400">{sectionName(s.section_id)}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {Array.isArray(s.fields)
                      ? `${(s.fields as unknown[]).length} field${(s.fields as unknown[]).length !== 1 ? "s" : ""}`
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
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-lg">
                {modal.mode === "create" ? "Add Schema" : "Edit Schema"}
              </h2>
              <div className="flex rounded-lg border border-gray-700 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => switchMode("visual")}
                  className={`px-3 py-1.5 transition ${
                    viewMode === "visual" ? "bg-amber-500 text-black" : "text-gray-400 hover:text-white"
                  }`}
                >
                  Visual
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("json")}
                  className={`px-3 py-1.5 transition ${
                    viewMode === "json" ? "bg-amber-500 text-black" : "text-gray-400 hover:text-white"
                  }`}
                >
                  JSON
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Character Schema"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>

            {modal.mode === "create" && (() => {
              const taken = new Set(schemas.map((s) => s.section_id).filter((id): id is string => !!id));
              const available = sections.filter((s) => !taken.has(s.id));
              return (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Section (optional)</label>
                  <select
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  >
                    <option value="">— All sections —</option>
                    {available.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {available.length < sections.length && (
                    <p className="text-xs text-gray-500 mt-1">
                      Sections already attached to a schema are hidden — one schema per section.
                    </p>
                  )}
                </div>
              );
            })()}

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">Fields</label>
                {viewMode === "visual" && (
                  <button
                    type="button"
                    onClick={addField}
                    className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                  >
                    + Add field
                  </button>
                )}
              </div>

              {viewMode === "visual" ? (
                <div className="space-y-3">
                  {fields.length === 0 ? (
                    <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-gray-800 rounded-lg">
                      No fields yet — click &quot;+ Add field&quot; to start.
                    </p>
                  ) : (
                    fields.map((f, idx) => (
                      <FieldCard
                        key={idx}
                        index={idx}
                        total={fields.length}
                        field={f}
                        sections={sections}
                        attrTypes={attrTypes}
                        onChange={(patch) => updateField(idx, patch)}
                        onRemove={() => removeField(idx)}
                        onMove={(dir) => moveField(idx, dir)}
                      />
                    ))
                  )}
                </div>
              ) : (
                <>
                  <textarea
                    rows={16}
                    value={jsonDraft}
                    onChange={(e) => { setJsonDraft(e.target.value); setJsonError(""); }}
                    spellCheck={false}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs font-mono focus:outline-none focus:border-white resize-none"
                  />
                  {jsonError && <p className="text-xs text-red-400 mt-1">{jsonError}</p>}
                  <p className="text-gray-600 text-xs mt-2">
                    Hand-edit the raw JSON for things the visual editor doesn&apos;t cover yet (multi-source backrefs, importing a schema from elsewhere). Switch back to Visual to confirm the parse worked.
                  </p>
                </>
              )}
            </div>

            <FilterAttrsEditor
              fields={fields}
              value={filterAttrs}
              onChange={setFilterAttrs}
            />

            <CardLayoutEditor
              fields={fields}
              attrs={allAttrs}
              value={cardLayout}
              onChange={setCardLayout}
            />

            <PageLayoutEditor
              fields={fields}
              attrs={allAttrs}
              gameName={gameName}
              sectionName={sectionName(modal.mode === "edit" ? modal.schema.section_id : (sectionId || null))}
              value={pageLayout}
              onChange={setPageLayout}
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold hover:bg-amber-400 transition disabled:opacity-50"
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

function FieldCard({
  index, total, field, sections, attrTypes, onChange, onRemove, onMove,
}: {
  index: number;
  total: number;
  field: SchemaField;
  sections: Section[];
  attrTypes: string[];
  onChange: (patch: Partial<SchemaField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const typeMeta = useMemo(() => FIELD_TYPES.find((t) => t.value === field.type), [field.type]);
  // First (single) backref source is the easy path; multi-source is JSON-only.
  const backrefSource = field.sources && field.sources.length > 0
    ? field.sources[0]
    : { source_section: field.source_section ?? "", source_field: field.source_field ?? "" };
  const multiSourceBackref = (field.sources?.length ?? 0) > 1;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-6 shrink-0">#{index + 1}</span>
        <span className="text-sm text-gray-300 flex-1 truncate">
          {field.label || <span className="text-gray-600">Untitled</span>}
          <span className="text-gray-600 ml-2 text-xs">
            ({FIELD_TYPE_LABEL[field.type] ?? field.type})
          </span>
        </span>
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          aria-label="Move up"
          className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          aria-label="Move down"
          className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove field"
          className="w-7 h-7 rounded border border-gray-700 text-red-400 hover:border-red-900 transition"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Label</label>
          <input
            type="text"
            value={field.label}
            onChange={(e) => {
              const nextLabel = e.target.value;
              // Auto-fill key from label only when key is empty / hasn't been
              // hand-edited away from a slugified version of the old label.
              const autoKey = !field.key || field.key === slugify(field.label);
              onChange({ label: nextLabel, ...(autoKey ? { key: slugify(nextLabel) } : null) });
            }}
            placeholder="e.g. Rarity"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">
            Key <span className="text-gray-600">(lowercase, underscores)</span>
          </label>
          <input
            type="text"
            value={field.key}
            onChange={(e) => onChange({ key: e.target.value.replace(/[^a-z0-9_]/g, "") })}
            placeholder="e.g. rarity"
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 block mb-1">Type</label>
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
          className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        {typeMeta && <p className="text-xs text-gray-600 mt-1">{typeMeta.help}</p>}
      </div>

      {field.type === "select" && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">Options (one per line)</label>
          <textarea
            rows={3}
            value={(field.options ?? []).join("\n")}
            onChange={(e) => onChange({ options: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
            placeholder={"SSR\nSR\nR"}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white resize-none"
          />
        </div>
      )}

      {(field.type === "attribute" || field.type === "resistances") && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Attribute type</label>
            <AttributeTypeInput
              value={field.attribute_type ?? ""}
              onChange={(v) => onChange({ attribute_type: v })}
              options={attrTypes}
            />
            <p className="text-xs text-gray-600 mt-1">
              Which attribute group this field pulls from (e.g. <code>element</code>, <code>class</code>). Manage attributes under{" "}
              <span className="text-gray-500">Attributes</span> on the game.
            </p>
          </div>
          {field.type === "attribute" && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={!!field.multi}
                onChange={(e) => onChange({ multi: e.target.checked })}
                className="accent-amber-500"
              />
              Allow multiple values (renders as pills, e.g. tags like DPS + AoE + Survival)
            </label>
          )}
        </div>
      )}

      {(field.type === "itemref" || field.type === "itemlist") && (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Item section</label>
            <select
              value={field.item_section ?? ""}
              onChange={(e) => onChange({ item_section: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
            >
              <option value="">— Pick a section —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>
          {field.type === "itemlist" && (
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={!!field.qty_range}
                onChange={(e) => onChange({ qty_range: e.target.checked })}
                className="accent-amber-500"
              />
              Quantity is a range (min/max) instead of a single number
            </label>
          )}
        </div>
      )}

      {field.type === "backref" && (
        <div className="space-y-3">
          {multiSourceBackref ? (
            <p className="text-xs text-amber-300/80 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              This backref has multiple sources. Edit them in the JSON view.
            </p>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Source section</label>
                <select
                  value={backrefSource.source_section}
                  onChange={(e) => onChange({
                    source_section: e.target.value,
                    source_field: backrefSource.source_field,
                    sources: undefined,
                  })}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                >
                  <option value="">— Pick a section —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.slug}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Source field key</label>
                <input
                  type="text"
                  value={backrefSource.source_field}
                  onChange={(e) => onChange({
                    source_section: backrefSource.source_section,
                    source_field: e.target.value.replace(/[^a-z0-9_]/g, ""),
                    sources: undefined,
                  })}
                  placeholder="e.g. operator"
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white"
                />
                <p className="text-xs text-gray-600 mt-1">
                  The field key on items in the source section that points back at this item.
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Combined free-text + datalist so users can pick from known attribute types
// or type a custom one if their attribute hasn't been created yet.
function AttributeTypeInput({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const listId = useId();
  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^a-z0-9_]/g, ""))}
        list={listId}
        placeholder="e.g. element"
        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white"
      />
      <datalist id={listId}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </>
  );
}

// Lets the admin pick which attribute-type fields are shown as filter chips
// on the section page. Stored as schema *field keys* (not attribute_types)
// so a field like {key: "element", attribute_type: "type"} works correctly
// — the renderer needs the key to read item.data[key]. `null` = auto,
// `[]` = no filters, `["element","path"]` = only those.
function FilterAttrsEditor({
  fields,
  value,
  onChange,
}: {
  fields: SchemaField[];
  value: string[] | null;
  onChange: (next: string[] | null) => void;
}) {
  const candidates = useMemo(() => {
    const out: { key: string; label: string; attr_type: string }[] = [];
    for (const f of fields) {
      if (f.type !== "attribute") continue;
      const at = f.attribute_type?.trim();
      if (!at || !f.key) continue;
      out.push({ key: f.key, label: f.label || f.key, attr_type: at });
    }
    return out;
  }, [fields]);

  const isAuto = value === null;
  const selected = new Set(value ?? []);

  function toggle(fieldKey: string) {
    if (isAuto) {
      // First click while auto = switch to explicit allowlist starting with
      // every candidate, then toggle off the one the user clicked.
      const next = candidates.map((c) => c.key).filter((k) => k !== fieldKey);
      onChange(next);
      return;
    }
    const next = new Set(selected);
    if (next.has(fieldKey)) next.delete(fieldKey);
    else next.add(fieldKey);
    onChange(Array.from(next));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-400">Filter chips on section page</label>
        <button
          type="button"
          onClick={() => onChange(isAuto ? [] : null)}
          className="text-xs text-amber-400 hover:text-amber-300"
        >
          {isAuto ? "Customize" : "Reset to auto"}
        </button>
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center border border-dashed border-gray-800 rounded-lg">
          Add an attribute-type field above to make it filterable.
        </p>
      ) : isAuto ? (
        <p className="text-xs text-gray-500 py-3 px-3 border border-dashed border-gray-800 rounded-lg">
          Auto — every attribute-type field with values shows as a filter chip group.
          Click <span className="text-amber-400">Customize</span> to pick a subset.
        </p>
      ) : (
        <div className="space-y-1.5 px-3 py-2.5 rounded-lg border border-gray-800 bg-gray-950/40">
          {candidates.map((c) => (
            <label key={c.key} className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={selected.has(c.key)}
                onChange={() => toggle(c.key)}
                className="accent-amber-500"
              />
              <span>{c.label}</span>
              <span className="text-xs text-gray-600 font-mono">({c.key})</span>
            </label>
          ))}
          {selected.size === 0 && (
            <p className="text-xs text-amber-300/80 pt-1">
              No filters will be shown for items in this schema.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Per-schema card display config: dropdowns for the border-color source,
// top-left badge, top-right badge, and a watermark + opacity, with a live
// preview rendering the same <ItemCard> the section page uses. Slot values
// are schema *field keys* so the renderer can read item.data[field.key]
// directly and use field.attribute_type to find the matching pill.
function CardLayoutEditor({
  fields,
  attrs,
  value,
  onChange,
}: {
  fields: SchemaField[];
  attrs: GameAttributeFull[];
  value: CardLayout | null;
  onChange: (next: CardLayout | null) => void;
}) {
  const candidates = useMemo(() => {
    const out: { key: string; label: string; attr_type: string }[] = [];
    for (const f of fields) {
      if (f.type !== "attribute") continue;
      const at = f.attribute_type?.trim();
      if (!at || !f.key) continue;
      out.push({ key: f.key, label: f.label || f.key, attr_type: at });
    }
    return out;
  }, [fields]);

  const isAuto = value === null;
  const layout = value ?? {};

  // Sample item for the preview: pick the first attribute of each
  // candidate's attribute_type, but key the value by FIELD KEY (matching
  // how real items store data). This way the preview is a faithful render
  // of what the public page will show.
  const previewItem = useMemo(() => {
    const data: Record<string, unknown> = { name: "Sample character", rarity: "SSR" };
    for (const c of candidates) {
      const first = attrs.find((a) => a.attr_type === c.attr_type);
      if (first) data[c.key] = first.key;
    }
    return { id: "preview", slug: "preview", data };
  }, [candidates, attrs]);

  const attrMap = useMemo(() => buildAttrMap(attrs), [attrs]);
  const previewFields = useMemo(
    () => candidates.map((c) => ({ key: c.key, label: c.label, type: "attribute", attribute_type: c.attr_type })),
    [candidates],
  );

  function patch(p: Partial<CardLayout>) {
    onChange({ ...(value ?? {}), ...p });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-400">Card display</label>
        <button
          type="button"
          onClick={() => onChange(isAuto ? {} : null)}
          className="text-xs text-amber-400 hover:text-amber-300"
        >
          {isAuto ? "Customize" : "Reset to defaults"}
        </button>
      </div>
      {candidates.length === 0 ? (
        <p className="text-xs text-gray-500 py-3 text-center border border-dashed border-gray-800 rounded-lg">
          Add an attribute-type field above to drive the card layout.
        </p>
      ) : isAuto ? (
        <p className="text-xs text-gray-500 py-3 px-3 border border-dashed border-gray-800 rounded-lg">
          Default — gacha-style card with rarity border and element badge top-right.
          Click <span className="text-amber-400">Customize</span> to drive border/badges/watermark from your attributes.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-3 py-3 rounded-lg border border-gray-800 bg-gray-950/40">
          <div className="space-y-3">
            <Slot label="Border color" value={layout.border_color_attr ?? ""} candidates={candidates}
              onChange={(v) => patch({ border_color_attr: v || null })} />
            <Slot label="Background color" value={layout.background_color_attr ?? ""} candidates={candidates}
              onChange={(v) => patch({ background_color_attr: v || null })} />
            <Slot label="Top-left badge" value={layout.badge_top_left ?? ""} candidates={candidates}
              onChange={(v) => patch({ badge_top_left: v || null })} />
            <Slot label="Top-right badge" value={layout.badge_top_right ?? ""} candidates={candidates}
              onChange={(v) => patch({ badge_top_right: v || null })} />
            <Slot label="Watermark" value={layout.watermark_attr ?? ""} candidates={candidates}
              onChange={(v) => patch({ watermark_attr: v || null })} />
            {layout.watermark_attr && (
              <div>
                <label className="text-xs text-gray-500 block mb-1">
                  Watermark opacity: {Math.round((layout.watermark_opacity ?? 0.3) * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={layout.watermark_opacity ?? 0.3}
                  onChange={(e) => patch({ watermark_opacity: parseFloat(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">Preview</p>
            <div className="max-w-[180px]">
              <ItemCard
                item={previewItem}
                attrMap={attrMap}
                layout={layout}
                schemaFields={previewFields}
                noLink
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Slot({
  label, value, candidates, onChange,
}: {
  label: string;
  value: string;
  candidates: { key: string; label: string; attr_type: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
      >
        <option value="">— none —</option>
        {candidates.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label} ({c.key})
          </option>
        ))}
      </select>
    </div>
  );
}
