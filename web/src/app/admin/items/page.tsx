"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi, gamesApi, itemsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ImageUploadField from "@/components/ImageUploadField";
import ItemFilterBar, { filterItems, type ActiveFilters } from "@/components/ItemFilterBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SafeImage } from "@/components/SafeImage";

interface Game { id: string; slug: string; name: string }
interface Section { id: string; slug: string; name: string }
interface SchemaField {
  key: string;
  label: string;
  type: "text" | "number" | "url" | "textarea" | "select" | "attribute" | "date" | "itemref";
  options?: string[];
  attribute_type?: string;
  item_section?: string;
}
interface Schema { id: string; name: string; fields: SchemaField[] }
interface GameAttribute {
  id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
}
interface Item {
  id: string;
  slug: string;
  game_id: string;
  section_id: string;
  type_schema_id: string;
  data: Record<string, unknown>;
  version: number;
  updated_at: string;
}

export default function AdminItemsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  // attributes grouped by attr_type for the selected game
  const [attrsByType, setAttrsByType] = useState<Map<string, GameAttribute[]>>(new Map());
  const [attrList, setAttrList] = useState<GameAttribute[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [search, setSearch] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: Item } | null>(null);
  const [form, setForm] = useState({ slug: "", section_id: "", type_schema_id: "", dataJson: "{}" });
  const [slugLocked, setSlugLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login?redirect=/admin/items");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    gamesApi.list(true).then((r) => setGames(r.data.data ?? []));
  }, [user]);

  const loadGame = async (game: Game) => {
    setSelectedGame(game);
    setLoadingItems(true);
    try {
      const [sectRes, schemaRes, itemsRes, attrRes] = await Promise.all([
        gamesApi.getSections(game.slug),
        adminApi.games.listSchemas(game.slug),
        itemsApi.list({ game_id: game.id, limit: 200, offset: 0 }),
        gamesApi.getAttributes(game.slug),
      ]);
      setSections(sectRes.data.data ?? []);
      setSchemas(schemaRes.data.data ?? []);
      setItems(itemsRes.data.data ?? []);
      setActiveFilters({});
      setSearch("");
      const attrs: GameAttribute[] = attrRes.data.data ?? [];
      setAttrList(attrs);
      const map = new Map<string, GameAttribute[]>();
      for (const a of attrs) {
        if (!map.has(a.attr_type)) map.set(a.attr_type, []);
        map.get(a.attr_type)!.push(a);
      }
      setAttrsByType(map);
    } finally {
      setLoadingItems(false);
    }
  };

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

  const openCreate = () => {
    setForm({
      slug: "",
      section_id: sections[0]?.id ?? "",
      type_schema_id: schemas[0]?.id ?? "",
      dataJson: JSON.stringify({ name: "", image_url: "" }, null, 2),
    });
    setSlugLocked(false);
    setFormError("");
    setShowRawJson(false);
    setModal({ mode: "create" });
  };

  const openEdit = (item: Item) => {
    setForm({
      slug: item.slug,
      section_id: item.section_id,
      type_schema_id: item.type_schema_id,
      dataJson: JSON.stringify(item.data, null, 2),
    });
    setSlugLocked(true);
    setFormError("");
    setShowRawJson(false);
    setModal({ mode: "edit", item });
  };

  const setFieldValue = (key: string, value: unknown) => {
    setForm((f) => {
      try {
        const parsed = JSON.parse(f.dataJson) as Record<string, unknown>;
        parsed[key] = value;
        const next = { ...f, dataJson: JSON.stringify(parsed, null, 2) };
        // Auto-generate slug from name when not manually locked
        if (key === "name" && !slugLocked && typeof value === "string") {
          next.slug = toSlug(value);
        }
        return next;
      } catch {
        return { ...f, dataJson: JSON.stringify({ [key]: value }, null, 2) };
      }
    });
  };

  const getFieldValue = (key: string): string => {
    try {
      const parsed = JSON.parse(form.dataJson) as Record<string, unknown>;
      const v = parsed[key];
      return v == null ? "" : String(v);
    } catch {
      return "";
    }
  };

  const save = async () => {
    setFormError("");
    let data: unknown;
    try {
      data = JSON.parse(form.dataJson);
    } catch {
      setFormError("Data must be valid JSON");
      return;
    }
    setSaving(true);
    try {
      if (modal?.mode === "create") {
        if (!selectedGame) return;
        const res = await adminApi.items.create({
          game_id: selectedGame.id,
          section_id: form.section_id,
          type_schema_id: form.type_schema_id,
          slug: form.slug,
          data,
        });
        setItems((prev) => [res.data.data, ...prev]);
      } else if (modal?.item) {
        const res = await adminApi.items.update(modal.item.id, { slug: form.slug, data });
        setItems((prev) => prev.map((i) => (i.id === modal.item!.id ? res.data.data : i)));
      }
      setModal(null);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setFormError(msg ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteItem = async () => {
    if (!deleteTarget) return;
    try {
      await adminApi.items.delete(deleteTarget);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget));
    } catch {
      setFormError("Failed to delete item");
    } finally {
      setDeleteTarget(null);
    }
  };

  const visibleItems = useMemo(
    () => filterItems(items, activeFilters, search),
    [items, activeFilters, search],
  );

  function toggleFilter(attrType: string, key: string) {
    setActiveFilters(prev => {
      const next = { ...prev };
      const cur = new Set(next[attrType] ?? []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      next[attrType] = cur;
      return next;
    });
  }

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← Admin</Link>
        <Link href="/admin/items/import" className="text-sm text-gray-400 hover:text-white ml-auto">
          Bulk Import ↑
        </Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Manage Items</h1>
        {selectedGame && sections.length > 0 && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Game selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => loadGame(g)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              selectedGame?.id === g.id ? "bg-white text-black" : "border border-gray-700 hover:border-gray-500"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {!selectedGame && <p className="text-gray-500 text-sm">Select a game to manage its items.</p>}

      {loadingItems && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {selectedGame && !loadingItems && items.length > 0 && (
        <ItemFilterBar
          attributes={attrList}
          items={items}
          activeFilters={activeFilters}
          search={search}
          onFilterToggle={toggleFilter}
          onClearAll={() => { setActiveFilters({}); setSearch(""); }}
          onSearchChange={setSearch}
        />
      )}

      {selectedGame && !loadingItems && (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900">
                <th className="text-left px-4 py-3 text-gray-400 font-medium w-14" />
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Slug</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Updated</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No items yet. Click &quot;+ Add Item&quot; to create the first one.
                  </td>
                </tr>
              ) : visibleItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No items match the current filters.
                  </td>
                </tr>
              ) : (
                visibleItems.map((item) => {
                  const name = (item.data?.name as string) ?? item.slug;
                  const img = item.data?.image_url as string | undefined;
                  return (
                    <tr key={item.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                      <td className="px-4 py-2">
                        {img ? (
                          <SafeImage src={img} alt={name} width={40} height={40} className="w-10 h-10 rounded object-cover" fallback={
                            <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-600 font-bold">
                              {name[0]?.toUpperCase()}
                            </div>
                          } />
                        ) : (
                          <div className="w-10 h-10 rounded bg-gray-800 flex items-center justify-center text-gray-600 font-bold">
                            {name[0]?.toUpperCase()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{item.slug}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {new Date(item.updated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-2 justify-end">
                          <Link
                            href={`/items/${item.id}`}
                            className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => openEdit(item)}
                            className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(item.id)}
                            className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-red-900 text-red-400 transition"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete item"
        description="Delete this item? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDeleteItem}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-[600px] space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-lg">{modal.mode === "create" ? "Add Item" : "Edit Item"}</h2>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">Slug</label>
                {modal?.mode === "create" && (
                  <span className="text-xs text-gray-600">
                    {slugLocked ? (
                      <button
                        type="button"
                        onClick={() => { setSlugLocked(false); setForm((f) => ({ ...f, slug: toSlug(getFieldValue("name")) })); }}
                        className="text-gray-500 hover:text-gray-300"
                      >
                        reset to auto
                      </button>
                    ) : (
                      <span className="text-gray-600 italic">auto from name</span>
                    )}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugLocked(true);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white font-mono"
                placeholder="auto-generated from name"
              />
            </div>
            {modal.mode === "create" && (
              <>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Section</label>
                  <select
                    value={form.section_id}
                    onChange={(e) => setForm((f) => ({ ...f, section_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  >
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Schema</label>
                  <select
                    value={form.type_schema_id}
                    onChange={(e) => setForm((f) => ({ ...f, type_schema_id: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  >
                    {schemas.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
            {/* Schema-driven form fields */}
            {(() => {
              const schema = schemas.find((s) => s.id === form.type_schema_id);
              const fields: SchemaField[] = Array.isArray(schema?.fields) ? (schema.fields as SchemaField[]) : [];
              const nonImageFields = fields.filter((f) => f.key !== "image_url");

              return (
                <>
                  {/* Image always shown as upload field */}
                  <ImageUploadField
                    label="Image"
                    value={getFieldValue("image_url")}
                    onChange={(url) => setFieldValue("image_url", url)}
                    placeholder="https://… or upload →"
                    previewHeight="h-20"
                  />

                  {/* Schema fields (excluding image_url) */}
                  {nonImageFields.map((field) => {
                    const currentVal = getFieldValue(field.key);
                    if (field.type === "attribute") {
                      const attrType = field.attribute_type ?? field.key;
                      const opts = attrsByType.get(attrType) ?? [];
                      const selected = opts.find((a) => a.key === currentVal);
                      return (
                        <div key={field.key}>
                          <label className="text-xs text-gray-400 block mb-1">{field.label}</label>
                          <div className="flex items-center gap-2">
                            {selected?.icon_url && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={selected.icon_url} alt={selected.name} className="w-6 h-6 object-contain flex-shrink-0" />
                            )}
                            {selected?.color && !selected.icon_url && (
                              <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: selected.color }} />
                            )}
                            <select
                              value={currentVal}
                              onChange={(e) => setFieldValue(field.key, e.target.value)}
                              className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                            >
                              <option value="">— select {field.attribute_type ?? field.key} —</option>
                              {opts.map((a) => (
                                <option key={a.key} value={a.key}>{a.name}</option>
                              ))}
                            </select>
                          </div>
                          {opts.length === 0 && (
                            <p className="text-xs text-yellow-500 mt-1">
                              No &quot;{field.attribute_type ?? field.key}&quot; attributes defined for this game yet.
                            </p>
                          )}
                        </div>
                      );
                    }
                    if (field.type === "date") {
                      return (
                        <div key={field.key}>
                          <label className="text-xs text-gray-400 block mb-1">{field.label}</label>
                          <input
                            type="date"
                            value={currentVal}
                            onChange={(e) => setFieldValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                          />
                        </div>
                      );
                    }
                    if (field.type === "itemref") {
                      const refSection = field.item_section
                        ? sections.find((s) => s.slug === field.item_section)
                        : null;
                      const refItems = refSection
                        ? items.filter((i) => i.section_id === refSection.id)
                        : items;
                      return (
                        <div key={field.key}>
                          <label className="text-xs text-gray-400 block mb-1">{field.label}</label>
                          <select
                            value={currentVal}
                            onChange={(e) => setFieldValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                          >
                            <option value="">— none —</option>
                            {refItems.map((i) => (
                              <option key={i.id} value={i.id}>
                                {(i.data?.name as string) ?? i.slug}
                              </option>
                            ))}
                          </select>
                          {field.item_section && refItems.length === 0 && (
                            <p className="text-xs text-yellow-500 mt-1">
                              No items in &quot;{field.item_section}&quot; yet.
                            </p>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div key={field.key}>
                        <label className="text-xs text-gray-400 block mb-1">{field.label}</label>
                        {field.type === "textarea" ? (
                          <textarea
                            value={currentVal}
                            onChange={(e) => setFieldValue(field.key, e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white resize-y"
                          />
                        ) : field.type === "select" && field.options ? (
                          <select
                            value={currentVal}
                            onChange={(e) => setFieldValue(field.key, e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                          >
                            <option value="">— select —</option>
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={field.type === "number" ? "number" : "text"}
                            value={currentVal}
                            onChange={(e) =>
                              setFieldValue(field.key, field.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)
                            }
                            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                          />
                        )}
                      </div>
                    );
                  })}

                  {/* Raw JSON toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowRawJson((v) => !v)}
                      className="text-xs text-gray-500 hover:text-gray-300 transition"
                    >
                      {showRawJson ? "▲ Hide raw JSON" : "▼ Show raw JSON"}
                    </button>
                    {showRawJson && (
                      <textarea
                        value={form.dataJson}
                        onChange={(e) => setForm((f) => ({ ...f, dataJson: e.target.value }))}
                        rows={10}
                        className="mt-2 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs font-mono focus:outline-none focus:border-white resize-y"
                      />
                    )}
                  </div>

                  {/* If no schema fields defined, always show raw JSON */}
                  {nonImageFields.length === 0 && !showRawJson && (
                    <div>
                      <label className="text-xs text-gray-400 block mb-1">Data (JSON)</label>
                      <textarea
                        value={form.dataJson}
                        onChange={(e) => setForm((f) => ({ ...f, dataJson: e.target.value }))}
                        rows={10}
                        className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white resize-y"
                      />
                    </div>
                  )}
                </>
              );
            })()}
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
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
