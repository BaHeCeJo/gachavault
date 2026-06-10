"use client";

import { type AttrMap } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import { FieldValue, HIDDEN_IN_DETAILS } from "@/components/detail/FieldValue";
import type { ItemRelations, SchemaField } from "@/components/detail/types";
import type { StatsTableConfig } from "@/lib/pageLayout";

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

  const autoKeys = (schemaFields.length > 0
    ? schemaFields.map((f) => f.key)
    : Object.keys(data)
  ).filter((k) => !HIDDEN_IN_DETAILS.has(k) && k !== "description" && k !== "lore");

  const keys = c.fields && c.fields.length > 0 ? c.fields : autoKeys;

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
