"use client";

import { type AttrMap } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import { FieldValue, HIDDEN_IN_DETAILS } from "@/components/detail/FieldValue";
import type { ItemRelations, SchemaField } from "@/components/detail/types";
import type { StatsTableConfig } from "@/lib/pageLayout";

// Which field keys this stats table will try to render: an explicit ordered
// list, or auto (every non-hidden schema field, minus description/lore which
// read better as rich text). Shared so the block and DetailRenderer's
// divider-keeping check agree on what counts as content.
function statsTableKeys(c: StatsTableConfig, bundle: ItemPageBundle): string[] {
  const data = bundle.item.data as Record<string, unknown>;
  const schemaFields = bundle.fields as SchemaField[];
  const autoKeys = (schemaFields.length > 0
    ? schemaFields.map((f) => f.key)
    : Object.keys(data)
  ).filter((k) => !HIDDEN_IN_DETAILS.has(k) && k !== "description" && k !== "lore");
  return c.fields && c.fields.length > 0 ? c.fields : autoKeys;
}

// True if at least one row would render. Backref rows count only when they
// actually resolve to linked items; every other field counts when non-empty.
// A stats table with no content renders nothing (no empty titled box).
export function statsTableHasContent(
  c: StatsTableConfig,
  bundle: ItemPageBundle,
  relations: ItemRelations,
): boolean {
  const data = bundle.item.data as Record<string, unknown>;
  const byKey = new Map((bundle.fields as SchemaField[]).map((f) => [f.key, f]));
  return statsTableKeys(c, bundle).some((k) => {
    const f = byKey.get(k);
    if (f?.type === "backref") return (relations.backRefs.get(k) ?? []).length > 0;
    const v = data[k];
    return v !== undefined && v !== null && v !== "";
  });
}

// A label/value table. Either an explicit ordered list of fields, or auto:
// every schema field except hidden ones (and description/lore, which read
// better as rich-text blocks). Same rendering as the legacy stats table.
export function StatsTableBlock({
  config,
  bundle,
  attrMap,
  relations,
  preview,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
  attrMap: AttrMap;
  relations: ItemRelations;
  preview: boolean;
}) {
  const c = (config ?? {}) as StatsTableConfig;
  const data = bundle.item.data as Record<string, unknown>;
  const schemaFields = bundle.fields as SchemaField[];
  const byKey = new Map(schemaFields.map((f) => [f.key, f]));

  // No renderable rows → render nothing rather than an empty titled box. The
  // preview deliberately keeps showing empty tables so template authors can see
  // every block they placed.
  if (!preview && !statsTableHasContent(c, bundle, relations)) return null;

  const keys = statsTableKeys(c, bundle);

  const rows = keys.map((key) => {
    const f = byKey.get(key);
    return { key, label: f?.label ?? key.replace(/_/g, " "), type: f?.type, attribute_type: f?.attribute_type };
  });

  return (
    <div className="mb-8">
      {c.title && (
        <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">{c.title}</h2>
      )}
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        {rows.map(({ key, label, type, attribute_type }, i) => {
          const value = data[key];
          const isBackref = type === "backref";
          if (!isBackref && (value === undefined || value === null || value === "")) return null;
          return (
            <div
              key={key}
              className={`flex items-start gap-4 px-4 py-3 ${i % 2 === 0 ? "bg-gray-900/60" : "bg-gray-900/30"}`}
            >
              <span className="text-gray-400 text-sm w-24 sm:w-32 shrink-0 capitalize pt-0.5">{label}</span>
              <div className="flex-1">
                <FieldValue
                  fieldKey={key}
                  value={value}
                  attrMap={attrMap}
                  fieldType={type}
                  fieldAttrType={attribute_type}
                  resolvedRef={type === "itemref" ? relations.resolvedRefs.get(String(value)) : undefined}
                  backRefItems={isBackref ? (relations.backRefs.get(key) ?? []) : undefined}
                  preview={preview}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
