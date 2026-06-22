"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ItemPageClient from "@/app/games/[slug]/[sectionSlug]/[itemSlug]/ItemPageClient";
import { itemsApi } from "@/lib/api";
import type { ItemPageBundle, SeoGameAttribute, SeoSchemaField } from "@/lib/seo";
import {
  BLOCK_TYPES,
  BLOCK_LABELS,
  defaultLayoutFromSchema,
  parsePageLayout,
  makeBlockId,
  type PageBlock,
  type PageLayout,
  type HeroConfig,
  type StatsTableConfig,
  type RichTextConfig,
  type ItemGridConfig,
  type DividerConfig,
  type GalleryConfig,
  type RatingsConfig,
  type SkillsConfig,
  type ColumnsConfig,
  type TabsConfig,
  type TabConfig,
} from "@/lib/pageLayout";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface EditorField {
  key: string;
  label: string;
  type: string;
  attribute_type?: string;
  multi?: boolean;
  options?: string[];
}

interface EditorAttr {
  attr_type: string;
  key: string;
}

// The candidate field lists every config panel draws its dropdowns from.
interface FieldCandidates {
  attributeFields: EditorField[];
  imageFields: EditorField[];
  textFields: EditorField[];
  refFields: EditorField[];
  allFields: EditorField[];
}

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white";

function sampleData(fields: EditorField[], attrs: EditorAttr[]): Record<string, unknown> {
  const data: Record<string, unknown> = {
    name: "Sample Character",
    rarity: "SSR",
    description: "A short sample description, shown wherever this template places a description block.",
    lore: "Sample lore line one.\nSample lore line two.",
  };
  for (const f of fields) {
    if (data[f.key] !== undefined) continue;
    switch (f.type) {
      case "attribute": {
        const first = attrs.find((a) => a.attr_type === (f.attribute_type ?? f.key));
        if (first) data[f.key] = f.multi ? [first.key] : first.key;
        break;
      }
      case "number":
        data[f.key] = 1234;
        break;
      case "textarea":
        data[f.key] = "Sample text.";
        break;
      case "date":
        data[f.key] = "2025-01-01";
        break;
      case "select":
        data[f.key] = f.options?.[0] ?? "Option";
        break;
      default:
        break;
    }
  }
  return data;
}

export function PageLayoutEditor({
  fields,
  attrs,
  gameName,
  gameId,
  sectionId,
  sectionName,
  value,
  onChange,
}: {
  fields: EditorField[];
  attrs: EditorAttr[];
  gameName: string;
  gameId: string;
  sectionId: string | null;
  sectionName: string;
  value: PageLayout | null;
  onChange: (next: PageLayout | null) => void;
}) {
  const isAuto = value === null;

  const [realItems, setRealItems] = useState<{ id: string; name: string; data: Record<string, unknown> }[]>([]);
  const [previewId, setPreviewId] = useState<string>("__sample");

  // Paste/export the whole layout as JSON — far faster than clicking in a large
  // template by hand.
  const [showJson, setShowJson] = useState(false);
  const [jsonDraft, setJsonDraft] = useState("");
  const [jsonError, setJsonError] = useState("");
  function openJson() {
    setJsonDraft(JSON.stringify(value ?? { version: 1, blocks: [] }, null, 2));
    setJsonError("");
    setShowJson(true);
  }
  function applyJson() {
    const parsed = parsePageLayout(jsonDraft);
    if (!parsed) {
      setJsonError("Couldn't parse that — it must be a JSON object with a \"blocks\" array.");
      return;
    }
    onChange(parsed);
    setShowJson(false);
  }

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    itemsApi
      .list({ game_id: gameId, section_id: sectionId ?? undefined, limit: 50, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        const list = (res?.data?.data ?? []) as Array<{ id: string; slug: string; data: Record<string, unknown> }>;
        setRealItems(list.map((it) => ({ id: it.id, name: (it.data?.name as string) ?? it.slug, data: it.data ?? {} })));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gameId, sectionId]);

  const candidates = useMemo<FieldCandidates>(
    () => ({
      attributeFields: fields.filter((f) => f.type === "attribute"),
      imageFields: fields.filter((f) => f.type === "image" || f.type === "url"),
      textFields: fields.filter((f) => f.type === "textarea" || f.type === "text"),
      refFields: fields.filter((f) => f.type === "itemref" || f.type === "itemlist" || f.type === "backref"),
      allFields: fields,
    }),
    [fields],
  );

  const previewBundle = useMemo<ItemPageBundle>(() => {
    const selected = realItems.find((i) => i.id === previewId);
    const data = selected ? selected.data : sampleData(fields, attrs);
    return {
      item: {
        id: selected?.id ?? "preview",
        slug: "sample",
        game_id: "",
        game_slug: "",
        section_id: "",
        section_slug: "",
        type_schema_id: null,
        data,
      },
      game: { id: "", slug: "", name: gameName, description: null, banner_url: null, logo_url: null },
      fields: fields as unknown as SeoSchemaField[],
      attributes: attrs as unknown as SeoGameAttribute[],
      sectionName: sectionName || "Section",
      locale: "en",
      pageLayout: value,
    };
  }, [fields, attrs, gameName, sectionName, value, realItems, previewId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-400">Detail page template</label>
        {isAuto ? (
          <div className="flex gap-3">
            <button type="button" onClick={() => onChange(defaultLayoutFromSchema(fields))} className="text-xs text-amber-400 hover:text-amber-300">
              Mirror current page
            </button>
            <button type="button" onClick={() => onChange({ version: 1, blocks: [] })} className="text-xs text-amber-400 hover:text-amber-300">
              Start blank
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={() => (showJson ? setShowJson(false) : openJson())} className="text-xs text-amber-400 hover:text-amber-300">
              {showJson ? "Close JSON" : "Edit as JSON"}
            </button>
            <button type="button" onClick={() => onChange(null)} className="text-xs text-amber-400 hover:text-amber-300">
              Reset to default
            </button>
          </div>
        )}
      </div>

      {!isAuto && showJson && (
        <div className="mb-3 space-y-2">
          <textarea
            rows={12}
            value={jsonDraft}
            onChange={(e) => { setJsonDraft(e.target.value); setJsonError(""); }}
            spellCheck={false}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-xs font-mono focus:outline-none focus:border-white resize-y"
          />
          {jsonError && <p className="text-xs text-red-400">{jsonError}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={applyJson} className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold hover:bg-amber-400 transition">Apply JSON</button>
            <button type="button" onClick={() => setShowJson(false)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-white transition">Cancel</button>
          </div>
          <p className="text-[11px] text-gray-600">Paste a full template here and Apply — then Save the schema as usual.</p>
        </div>
      )}

      {isAuto ? (
        <p className="text-xs text-gray-500 py-3 px-3 border border-dashed border-gray-800 rounded-lg">
          Default — items render the standard fixed page (image, stats, description, lore, related).
          Click <span className="text-amber-400">Mirror current page</span> to turn it into editable blocks,
          or <span className="text-amber-400">Start blank</span> to build from scratch.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BlockListEditor
            blocks={value?.blocks ?? []}
            onChange={(next) => onChange({ version: 1, blocks: next })}
            candidates={candidates}
            allowContainers
          />

          <div>
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-xs text-gray-500">Preview</p>
              <select
                value={previewId}
                onChange={(e) => setPreviewId(e.target.value)}
                className="text-xs px-2 py-1 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:border-white max-w-[60%] truncate"
                title="Preview the template against a real item"
              >
                <option value="__sample">Sample item</option>
                {realItems.map((it) => (
                  <option key={it.id} value={it.id}>{it.name}</option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-950 overflow-hidden max-h-[60vh] overflow-y-auto">
              <div className="scale-[0.92] origin-top">
                <ItemPageClient initial={previewBundle} preview />
              </div>
            </div>
            <p className="text-[11px] text-gray-600 mt-1">
              Pick a real item to see its art. Related-item and reference grids stay empty here — they only fill in on the live page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// A sortable, addable list of blocks. Reused recursively inside container
// blocks (columns/tabs) with allowContainers=false to enforce the nesting cap.
function BlockListEditor({
  blocks,
  onChange,
  candidates,
  allowContainers,
}: {
  blocks: PageBlock[];
  onChange: (next: PageBlock[]) => void;
  candidates: FieldCandidates;
  allowContainers: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function patchBlockConfig(idx: number, patch: Record<string, unknown>) {
    onChange(blocks.map((b, i) => (i === idx ? { ...b, config: { ...(b.config ?? {}), ...patch } } : b)));
  }
  function removeBlock(idx: number) {
    onChange(blocks.filter((_, i) => i !== idx));
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= blocks.length) return;
    const copy = blocks.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onChange(copy);
  }
  function addBlock(type: string) {
    const meta = BLOCK_TYPES.find((b) => b.type === type);
    onChange([...blocks, { id: makeBlockId(), type, config: meta?.defaultConfig() ?? {} }]);
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onChange(arrayMove(blocks, oldIndex, newIndex));
  }

  const palette = BLOCK_TYPES.filter((b) => allowContainers || !b.container);

  return (
    <div className="space-y-3">
      {blocks.length === 0 ? (
        <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-gray-800 rounded-lg">
          No blocks yet — add one below.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {blocks.map((block, idx) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={idx}
                  total={blocks.length}
                  candidates={candidates}
                  allowContainers={allowContainers}
                  onPatch={(patch) => patchBlockConfig(idx, patch)}
                  onMove={(dir) => moveBlock(idx, dir)}
                  onRemove={() => removeBlock(idx)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {palette.map((b) => (
          <button key={b.type} type="button" onClick={() => addBlock(b.type)} title={b.help} className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-white transition">
            + {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockCard({
  block, index, total, candidates, allowContainers, onPatch, onMove, onRemove,
}: {
  block: PageBlock;
  index: number;
  total: number;
  candidates: FieldCandidates;
  allowContainers: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners} aria-label="Drag to reorder" className="w-5 shrink-0 cursor-grab active:cursor-grabbing touch-none text-gray-600 hover:text-gray-300 leading-none">⠿</button>
        <span className="text-xs text-gray-500 w-6 shrink-0">#{index + 1}</span>
        <span className="text-sm text-gray-300 flex-1 truncate">{BLOCK_LABELS[block.type] ?? block.type}</span>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up" className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30 disabled:cursor-not-allowed">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down" className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30 disabled:cursor-not-allowed">↓</button>
        <button type="button" onClick={onRemove} aria-label="Remove block" className="w-7 h-7 rounded border border-gray-700 text-red-400 hover:border-red-900 transition">✕</button>
      </div>

      {block.type === "hero" && <HeroConfigPanel config={(block.config ?? {}) as HeroConfig} attributeFields={candidates.attributeFields} imageFields={candidates.imageFields} onPatch={onPatch} />}
      {block.type === "stats_table" && <StatsConfigPanel config={(block.config ?? {}) as StatsTableConfig} allFields={candidates.allFields} onPatch={onPatch} />}
      {block.type === "rich_text" && <RichTextConfigPanel config={(block.config ?? {}) as RichTextConfig} textFields={candidates.textFields} onPatch={onPatch} />}
      {block.type === "item_grid" && <ItemGridConfigPanel config={(block.config ?? {}) as ItemGridConfig} refFields={candidates.refFields} onPatch={onPatch} />}
      {block.type === "divider" && <DividerConfigPanel config={(block.config ?? {}) as DividerConfig} onPatch={onPatch} />}
      {block.type === "gallery" && <GalleryConfigPanel config={(block.config ?? {}) as GalleryConfig} imageFields={candidates.imageFields} onPatch={onPatch} />}
      {block.type === "ratings" && <RatingsConfigPanel config={(block.config ?? {}) as RatingsConfig} allFields={candidates.allFields} onPatch={onPatch} />}
      {block.type === "skills" && <SkillsConfigPanel config={(block.config ?? {}) as SkillsConfig} allFields={candidates.allFields} onPatch={onPatch} />}
      {block.type === "columns" && allowContainers && <ColumnsConfigPanel config={(block.config ?? {}) as ColumnsConfig} candidates={candidates} onPatch={onPatch} />}
      {block.type === "tabs" && allowContainers && <TabsConfigPanel config={(block.config ?? {}) as TabsConfig} candidates={candidates} onPatch={onPatch} />}
    </div>
  );
}

function HeroConfigPanel({ config, attributeFields, imageFields, onPatch }: { config: HeroConfig; attributeFields: EditorField[]; imageFields: EditorField[]; onPatch: (p: Record<string, unknown>) => void }) {
  const selected = new Set(config.badge_fields ?? []);
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onPatch({ badge_fields: Array.from(next) });
  };
  const extraImageFields = imageFields.filter((f) => f.key !== "image_url" && f.key !== "icon_url");
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Image field</label>
        <select value={config.image_field ?? "image_url"} onChange={(e) => onPatch({ image_field: e.target.value })} className={inputCls}>
          <option value="image_url">image_url (default)</option>
          <option value="icon_url">icon_url</option>
          {extraImageFields.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300">
        <input type="checkbox" checked={config.show_section_tag ?? false} onChange={(e) => onPatch({ show_section_tag: e.target.checked })} className="accent-amber-500" />
        Show section tag
      </label>
      <div>
        <p className="text-xs text-gray-500 mb-1">Badge pills (attribute fields)</p>
        {attributeFields.length === 0 ? (
          <p className="text-xs text-gray-600">No attribute fields in this schema.</p>
        ) : (
          <div className="space-y-1">
            {attributeFields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} className="accent-amber-500" />
                <span>{f.label}</span>
                <span className="text-xs text-gray-600 font-mono">({f.key})</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatsConfigPanel({ config, allFields, onPatch }: { config: StatsTableConfig; allFields: EditorField[]; onPatch: (p: Record<string, unknown>) => void }) {
  const custom = Array.isArray(config.fields);
  const selected = new Set(config.fields ?? []);
  const cands = allFields.filter((f) => f.key !== "description" && f.key !== "lore" && f.key !== "image_url" && f.key !== "icon_url" && f.key !== "name");
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onPatch({ fields: Array.from(next) });
  };
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Title (optional)</label>
        <input type="text" value={config.title ?? ""} onChange={(e) => onPatch({ title: e.target.value })} placeholder="e.g. Stats" className={inputCls} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Fields: {custom ? "custom" : "auto (all)"}</span>
        <button type="button" onClick={() => onPatch({ fields: custom ? undefined : cands.map((c) => c.key) })} className="text-xs text-amber-400 hover:text-amber-300">
          {custom ? "Use auto" : "Pick fields"}
        </button>
      </div>
      {custom && (
        <div className="space-y-1 max-h-40 overflow-y-auto px-2 py-1.5 rounded-lg border border-gray-800 bg-gray-950/40">
          {cands.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} className="accent-amber-500" />
              <span>{f.label}</span>
              <span className="text-xs text-gray-600 font-mono">({f.key})</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function RichTextConfigPanel({ config, textFields, onPatch }: { config: RichTextConfig; textFields: EditorField[]; onPatch: (p: Record<string, unknown>) => void }) {
  const fieldKeys = new Set(textFields.map((f) => f.key));
  const sources = [...textFields.map((f) => ({ key: f.key, label: f.label }))];
  for (const k of ["description", "lore"]) {
    if (!fieldKeys.has(k)) sources.push({ key: k, label: k[0].toUpperCase() + k.slice(1) });
  }
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Title (optional)</label>
        <input type="text" value={config.title ?? ""} onChange={(e) => onPatch({ title: e.target.value })} placeholder="e.g. Review" className={inputCls} />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Source</label>
        <select
          value={config.source_field ?? "__static"}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__static") onPatch({ source_field: undefined });
            else onPatch({ source_field: v, static_text: undefined });
          }}
          className={inputCls}
        >
          <option value="__static">Custom text</option>
          {sources.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.key})</option>)}
        </select>
      </div>
      {!config.source_field && (
        <div>
          <label className="text-xs text-gray-500 block mb-1">Custom text</label>
          <textarea rows={3} value={config.static_text ?? ""} onChange={(e) => onPatch({ static_text: e.target.value })} className={`${inputCls} resize-y`} />
        </div>
      )}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Style</label>
        <select value={config.style ?? "plain"} onChange={(e) => onPatch({ style: e.target.value })} className={inputCls}>
          <option value="plain">Plain</option>
          <option value="quote">Quote (amber bar, italic)</option>
          <option value="lore">Lore (preserve line breaks)</option>
        </select>
      </div>
    </div>
  );
}

function ItemGridConfigPanel({ config, refFields, onPatch }: { config: ItemGridConfig; refFields: EditorField[]; onPatch: (p: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Title (optional)</label>
        <input type="text" value={config.title ?? ""} onChange={(e) => onPatch({ title: e.target.value })} placeholder="e.g. Best Light Cones" className={inputCls} />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Source</label>
        <select value={config.source ?? "related"} onChange={(e) => onPatch({ source: e.target.value })} className={inputCls}>
          <option value="related">Related items (same section)</option>
          {refFields.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Columns</label>
          <select value={config.columns ?? 6} onChange={(e) => onPatch({ columns: Number(e.target.value) })} className={inputCls}>
            <option value={3}>3</option>
            <option value={4}>4</option>
            <option value={6}>6</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Max items</label>
          <input type="number" min={1} value={config.limit ?? 12} onChange={(e) => onPatch({ limit: e.target.value === "" ? undefined : Number(e.target.value) })} className={inputCls} />
        </div>
      </div>
    </div>
  );
}

function DividerConfigPanel({ config, onPatch }: { config: DividerConfig; onPatch: (p: Record<string, unknown>) => void }) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">Label (optional)</label>
      <input type="text" value={config.label ?? ""} onChange={(e) => onPatch({ label: e.target.value })} placeholder="e.g. Builds" className={inputCls} />
    </div>
  );
}

function GalleryConfigPanel({ config, imageFields, onPatch }: { config: GalleryConfig; imageFields: EditorField[]; onPatch: (p: Record<string, unknown>) => void }) {
  const selected = new Set(config.image_fields ?? []);
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    onPatch({ image_fields: Array.from(next) });
  };
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Title (optional)</label>
        <input type="text" value={config.title ?? ""} onChange={(e) => onPatch({ title: e.target.value })} placeholder="e.g. Gallery" className={inputCls} />
      </div>
      <div>
        <p className="text-xs text-gray-500 mb-1">Image fields</p>
        {imageFields.length === 0 ? (
          <p className="text-xs text-gray-600">No image/url fields in this schema.</p>
        ) : (
          <div className="space-y-1">
            {imageFields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} className="accent-amber-500" />
                <span>{f.label}</span>
                <span className="text-xs text-gray-600 font-mono">({f.key})</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Columns</label>
        <select value={config.columns ?? 3} onChange={(e) => onPatch({ columns: Number(e.target.value) })} className={inputCls}>
          <option value={1}>1 (single, fills width)</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>
    </div>
  );
}

function RatingsConfigPanel({ config, allFields, onPatch }: { config: RatingsConfig; allFields: EditorField[]; onPatch: (p: Record<string, unknown>) => void }) {
  const entries = config.entries ?? [];
  const update = (next: { label: string; field: string }[]) => onPatch({ entries: next });
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Title (optional)</label>
        <input type="text" value={config.title ?? ""} onChange={(e) => onPatch({ title: e.target.value })} placeholder="e.g. Ratings" className={inputCls} />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">Style</label>
        <select value={config.style ?? "badge"} onChange={(e) => onPatch({ style: e.target.value })} className={inputCls}>
          <option value="badge">Badges</option>
          <option value="bar">Bars (numeric)</option>
        </select>
      </div>
      <div className="space-y-2">
        {entries.map((entry, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input type="text" value={entry.label} onChange={(e) => update(entries.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" className={`${inputCls} flex-1`} />
            <select value={entry.field} onChange={(e) => update(entries.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))} className={`${inputCls} flex-1`}>
              <option value="">— field —</option>
              {allFields.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
            </select>
            <button type="button" onClick={() => update(entries.filter((_, j) => j !== i))} aria-label="Remove" className="w-7 h-7 rounded border border-gray-700 text-red-400 hover:border-red-900 transition shrink-0">✕</button>
          </div>
        ))}
        <button type="button" onClick={() => update([...entries, { label: "", field: "" }])} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">+ Add rating</button>
      </div>
    </div>
  );
}

function SkillsConfigPanel({ config, allFields, onPatch }: { config: SkillsConfig; allFields: EditorField[]; onPatch: (p: Record<string, unknown>) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Title (optional)</label>
        <input type="text" value={config.title ?? ""} onChange={(e) => onPatch({ title: e.target.value })} placeholder="e.g. Skills" className={inputCls} />
      </div>
      <div>
        <label className="text-xs text-gray-500 block mb-1">List field (array of skill objects)</label>
        <select value={config.list_field ?? ""} onChange={(e) => onPatch({ list_field: e.target.value })} className={inputCls}>
          <option value="">— field —</option>
          {allFields.map((f) => <option key={f.key} value={f.key}>{f.label} ({f.key})</option>)}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Name key</label>
          <input type="text" value={config.name_key ?? ""} onChange={(e) => onPatch({ name_key: e.target.value })} placeholder="name" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Desc key</label>
          <input type="text" value={config.desc_key ?? ""} onChange={(e) => onPatch({ desc_key: e.target.value })} placeholder="description" className={inputCls} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Icon key</label>
          <input type="text" value={config.icon_key ?? ""} onChange={(e) => onPatch({ icon_key: e.target.value })} placeholder="icon_url" className={inputCls} />
        </div>
      </div>
    </div>
  );
}

function ColumnsConfigPanel({ config, candidates, onPatch }: { config: ColumnsConfig; candidates: FieldCandidates; onPatch: (p: Record<string, unknown>) => void }) {
  const cols = Array.isArray(config.columns) ? config.columns : [[], []];
  const col0 = cols[0] ?? [];
  const col1 = cols[1] ?? [];
  const setCol = (i: 0 | 1, next: PageBlock[]) => onPatch({ columns: i === 0 ? [next, col1] : [col0, next] });
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500 block mb-1">Ratio</label>
        <select value={config.ratio ?? "1-1"} onChange={(e) => onPatch({ ratio: e.target.value })} className={inputCls}>
          <option value="1-1">1 : 1</option>
          <option value="1-2">1 : 2</option>
          <option value="2-1">2 : 1</option>
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-800 p-2">
          <p className="text-xs text-gray-500 mb-2">Left column</p>
          <BlockListEditor blocks={col0} onChange={(next) => setCol(0, next)} candidates={candidates} allowContainers={false} />
        </div>
        <div className="rounded-lg border border-gray-800 p-2">
          <p className="text-xs text-gray-500 mb-2">Right column</p>
          <BlockListEditor blocks={col1} onChange={(next) => setCol(1, next)} candidates={candidates} allowContainers={false} />
        </div>
      </div>
    </div>
  );
}

function TabsConfigPanel({ config, candidates, onPatch }: { config: TabsConfig; candidates: FieldCandidates; onPatch: (p: Record<string, unknown>) => void }) {
  const tabs = config.tabs ?? [];
  const update = (next: TabConfig[]) => onPatch({ tabs: next });
  return (
    <div className="space-y-3">
      {tabs.map((tab, i) => (
        <div key={tab.id} className="rounded-lg border border-gray-800 p-2 space-y-2">
          <div className="flex gap-2 items-center">
            <input type="text" value={tab.label} onChange={(e) => update(tabs.map((t, j) => (j === i ? { ...t, label: e.target.value } : t)))} placeholder={`Tab ${i + 1}`} className={`${inputCls} flex-1`} />
            <button type="button" onClick={() => update(tabs.filter((_, j) => j !== i))} aria-label="Remove tab" className="w-7 h-7 rounded border border-gray-700 text-red-400 hover:border-red-900 transition shrink-0">✕</button>
          </div>
          <BlockListEditor blocks={tab.blocks} onChange={(next) => update(tabs.map((t, j) => (j === i ? { ...t, blocks: next } : t)))} candidates={candidates} allowContainers={false} />
        </div>
      ))}
      <button type="button" onClick={() => update([...tabs, { id: makeBlockId(), label: `Tab ${tabs.length + 1}`, blocks: [] }])} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">+ Add tab</button>
    </div>
  );
}
