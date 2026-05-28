// Shared helpers for resolving item.data values to GameAttribute records.
// Several pages do the same lookup ("what attribute pill does this value
// correspond to?") — this is the canonical place.

export interface GameAttribute {
  id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
  sort_order?: number;
}

export type AttrMap = Record<string, Record<string, GameAttribute>>;

export function buildAttrMap(attrs: GameAttribute[]): AttrMap {
  const map: AttrMap = {};
  for (const a of attrs) {
    if (!map[a.attr_type]) map[a.attr_type] = {};
    map[a.attr_type][a.key.toLowerCase()] = a;
  }
  return map;
}

export function lookupAttr(map: AttrMap, attrType: string, value: unknown): GameAttribute | null {
  if (typeof value !== "string") return null;
  return map[attrType]?.[value.toLowerCase()] ?? null;
}

// Multi-value attribute fields are stored as arrays — for places that only
// render a single chip/icon (cards, list rows), use the first entry.
export function firstValue(v: unknown): unknown {
  return Array.isArray(v) ? v[0] : v;
}

// Minimal schema-field shape needed by item-rendering components. A schema
// field's `key` is where the item stores its value (item.data[key]) while
// `attribute_type` says which attribute pool the value is drawn from. The
// two are commonly equal but don't have to be (HSR character schema names
// its element field `element` but draws from attribute type `type`).
export interface SchemaFieldLite {
  key: string;
  label: string;
  type: string;
  attribute_type?: string;
}

// Build a lookup from field key -> SchemaFieldLite for fast resolution at
// render time. Only attribute-type fields are interesting for badges/filters.
export function attributeFieldsByKey(fields: SchemaFieldLite[]): Record<string, SchemaFieldLite> {
  const out: Record<string, SchemaFieldLite> = {};
  for (const f of fields) {
    if (f.type === "attribute" && f.attribute_type) out[f.key] = f;
  }
  return out;
}
