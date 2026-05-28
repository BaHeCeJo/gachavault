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
