"use client";

import { useEffect, useMemo, useState } from "react";
import ItemPageClient from "@/app/games/[slug]/[sectionSlug]/[itemSlug]/ItemPageClient";
import { itemsApi } from "@/lib/api";
import type { ItemPageBundle, SeoGameAttribute, SeoSchemaField } from "@/lib/seo";
import {
  BLOCK_TYPES,
  BLOCK_LABELS,
  defaultLayoutFromSchema,
  makeBlockId,
  type PageBlock,
  type PageLayout,
  type HeroConfig,
  type StatsTableConfig,
  type RichTextConfig,
  type ItemGridConfig,
} from "@/lib/pageLayout";

// The schema editor's field shape (a structural subset is enough here).
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

const inputCls =
  "w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white";

// Synthesize a representative item so the preview shows a populated page
// without hitting the network. Cross-item blocks (related items, itemref
// grids) stay empty in preview — that data only resolves on the live page.
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
      case "url":
      case "image":
      case "itemref":
      case "itemlist":
      case "backref":
      case "resistances":
        break; // can't synthesize meaningfully
      default:
        data[f.key] = "Sample";
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
  const blocks = value?.blocks ?? [];

  // Real items of this section, so the preview can render an actual splash art
  // instead of the synthesized sample.
  const [realItems, setRealItems] = useState<{ id: string; name: string; data: Record<string, unknown> }[]>([]);
  const [previewId, setPreviewId] = useState<string>("__sample");

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

  const attributeFields = useMemo(() => fields.filter((f) => f.type === "attribute"), [fields]);
  const imageFields = useMemo(() => fields.filter((f) => f.type === "image" || f.type === "url"), [fields]);
  const textFields = useMemo(
    () => fields.filter((f) => f.type === "textarea" || f.type === "text"),
    [fields],
  );
  const refFields = useMemo(
    () => fields.filter((f) => f.type === "itemref" || f.type === "itemlist" || f.type === "backref"),
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

  function setBlocks(next: PageBlock[]) {
    onChange({ version: 1, blocks: next });
  }
  function patchBlockConfig(idx: number, patch: Record<string, unknown>) {
    setBlocks(blocks.map((b, i) => (i === idx ? { ...b, config: { ...(b.config ?? {}), ...patch } } : b)));
  }
  function removeBlock(idx: number) {
    setBlocks(blocks.filter((_, i) => i !== idx));
  }
  function moveBlock(idx: number, dir: -1 | 1) {
    const next = idx + dir;
    if (next < 0 || next >= blocks.length) return;
    const copy = blocks.slice();
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setBlocks(copy);
  }
  function addBlock(type: string) {
    const meta = BLOCK_TYPES.find((b) => b.type === type);
    setBlocks([...blocks, { id: makeBlockId(), type, config: meta?.defaultConfig() ?? {} }]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-400">Detail page template</label>
        {isAuto ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onChange(defaultLayoutFromSchema(fields))}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              Mirror current page
            </button>
            <button
              type="button"
              onClick={() => onChange({ version: 1, blocks: [] })}
              className="text-xs text-amber-400 hover:text-amber-300"
            >
              Start blank
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs text-amber-400 hover:text-amber-300"
          >
            Reset to default
          </button>
        )}
      </div>

      {isAuto ? (
        <p className="text-xs text-gray-500 py-3 px-3 border border-dashed border-gray-800 rounded-lg">
          Default — items render the standard fixed page (image, stats, description, lore, related).
          Click <span className="text-amber-400">Mirror current page</span> to turn it into editable blocks,
          or <span className="text-amber-400">Start blank</span> to build from scratch.
        </p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Block list */}
          <div className="space-y-3">
            {blocks.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center border border-dashed border-gray-800 rounded-lg">
                No blocks yet — add one below.
              </p>
            ) : (
              blocks.map((block, idx) => (
                <BlockCard
                  key={block.id}
                  block={block}
                  index={idx}
                  total={blocks.length}
                  attributeFields={attributeFields}
                  imageFields={imageFields}
                  textFields={textFields}
                  refFields={refFields}
                  allFields={fields}
                  onPatch={(patch) => patchBlockConfig(idx, patch)}
                  onMove={(dir) => moveBlock(idx, dir)}
                  onRemove={() => removeBlock(idx)}
                />
              ))
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {BLOCK_TYPES.map((b) => (
                <button
                  key={b.type}
                  type="button"
                  onClick={() => addBlock(b.type)}
                  title={b.help}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-700 hover:border-white transition"
                >
                  + {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
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

function BlockCard({
  block, index, total, attributeFields, imageFields, textFields, refFields, allFields, onPatch, onMove, onRemove,
}: {
  block: PageBlock;
  index: number;
  total: number;
  attributeFields: EditorField[];
  imageFields: EditorField[];
  textFields: EditorField[];
  refFields: EditorField[];
  allFields: EditorField[];
  onPatch: (patch: Record<string, unknown>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 w-6 shrink-0">#{index + 1}</span>
        <span className="text-sm text-gray-300 flex-1 truncate">{BLOCK_LABELS[block.type] ?? block.type}</span>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up"
          className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30 disabled:cursor-not-allowed">↑</button>
        <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Move down"
          className="w-7 h-7 rounded border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition disabled:opacity-30 disabled:cursor-not-allowed">↓</button>
        <button type="button" onClick={onRemove} aria-label="Remove block"
          className="w-7 h-7 rounded border border-gray-700 text-red-400 hover:border-red-900 transition">✕</button>
      </div>

      {block.type === "hero" && (
        <HeroConfigPanel config={(block.config ?? {}) as HeroConfig} attributeFields={attributeFields} imageFields={imageFields} onPatch={onPatch} />
      )}
      {block.type === "stats_table" && (
        <StatsConfigPanel config={(block.config ?? {}) as StatsTableConfig} allFields={allFields} onPatch={onPatch} />
      )}
      {block.type === "rich_text" && (
        <RichTextConfigPanel config={(block.config ?? {}) as RichTextConfig} textFields={textFields} onPatch={onPatch} />
      )}
      {block.type === "item_grid" && (
        <ItemGridConfigPanel config={(block.config ?? {}) as ItemGridConfig} refFields={refFields} onPatch={onPatch} />
      )}
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
  const candidates = allFields.filter((f) => f.key !== "description" && f.key !== "lore" && f.key !== "image_url" && f.key !== "icon_url" && f.key !== "name");
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
        <button type="button" onClick={() => onPatch({ fields: custom ? undefined : candidates.map((c) => c.key) })} className="text-xs text-amber-400 hover:text-amber-300">
          {custom ? "Use auto" : "Pick fields"}
        </button>
      </div>
      {custom && (
        <div className="space-y-1 max-h-40 overflow-y-auto px-2 py-1.5 rounded-lg border border-gray-800 bg-gray-950/40">
          {candidates.map((f) => (
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
  // Source options: known text/textarea fields, plus description/lore which
  // commonly exist as data even when not declared as schema fields.
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
