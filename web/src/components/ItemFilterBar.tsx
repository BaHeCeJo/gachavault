"use client";

import { useMemo } from "react";
import type { SchemaFieldLite } from "@/lib/attrs";

export interface GameAttribute {
  id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
  sort_order?: number;
}

// Active filter selections. The outer key is a *group id* — when a schema is
// provided, that's the schema field's key (so item.data[fieldKey] is what
// gets matched). With no schema, it falls back to the legacy attr_type
// convention. The inner Set holds attribute keys the user has activated.
export type ActiveFilters = Record<string, Set<string>>;

interface Props {
  attributes: GameAttribute[];
  items: { data: Record<string, unknown> }[];
  activeFilters: ActiveFilters;
  search: string;
  // When provided, filter groups are driven by the schema's attribute-type
  // fields — group id = field.key (the JSON key on item.data), group label
  // = field.label, pills come from attrMap[field.attribute_type]. When
  // absent, the older attr_type-as-everything fallback is used.
  schemaFields?: SchemaFieldLite[];
  // Allowlist of group ids to render. Field keys when schemaFields is set,
  // attr_types otherwise. null/undefined = auto.
  allowedKeys?: string[] | null;
  onFilterToggle: (groupId: string, key: string) => void;
  onClearAll: () => void;
  onSearchChange: (v: string) => void;
}

// Priority order for filter groups
const TYPE_ORDER = [
  "element", "path", "specialty", "class", "role",
  "weapon_type", "weapon", "manufacturer", "faction",
  "school", "rarity", "burst_type", "position",
  "attack_type", "armor_type", "construct_type",
];

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function filterItems<T extends { data: Record<string, unknown> }>(
  items: T[],
  activeFilters: ActiveFilters,
  search: string,
): T[] {
  const activeGroups = Object.entries(activeFilters).filter(([, s]) => s.size > 0);
  return items.filter((item) => {
    // Name search
    if (search.trim()) {
      const name = (item.data?.name as string ?? "").toLowerCase();
      if (!name.includes(search.toLowerCase().trim())) return false;
    }
    // AND across groups, OR within group. Group id is the JSON key on
    // item.data (either field.key when schema-driven, or attr_type legacy).
    for (const [groupId, keys] of activeGroups) {
      const raw = item.data[groupId];
      const itemVals = Array.isArray(raw)
        ? (raw as unknown[]).map((v) => String(v).toLowerCase())
        : raw != null
          ? [String(raw).toLowerCase()]
          : [];
      const wanted = Array.from(keys, (k) => k.toLowerCase());
      if (!itemVals.some((v) => wanted.includes(v))) return false;
    }
    return true;
  });
}

export default function ItemFilterBar({
  attributes,
  items,
  activeFilters,
  search,
  schemaFields,
  allowedKeys,
  onFilterToggle,
  onClearAll,
  onSearchChange,
}: Props) {
  // Group definition: id (= JSON key on item.data), label (shown left of
  // pills), and attr_type (which pool to pull pills from). With a schema we
  // walk its attribute-type fields; without one we fall back to the legacy
  // convention where the attr_type itself doubles as the JSON key.
  const groupDefs = useMemo(() => {
    if (schemaFields && schemaFields.length > 0) {
      return schemaFields
        .filter((f) => f.type === "attribute" && f.attribute_type)
        .map((f) => ({ id: f.key, label: f.label || f.key, attrType: f.attribute_type as string }));
    }
    const seen = new Set<string>();
    const out: { id: string; label: string; attrType: string }[] = [];
    for (const a of attributes) {
      if (seen.has(a.attr_type)) continue;
      seen.add(a.attr_type);
      out.push({ id: a.attr_type, label: a.attr_type, attrType: a.attr_type });
    }
    return out;
  }, [schemaFields, attributes]);

  // Per group id, the set of attribute keys that ≥1 item actually has a
  // value for. Drives (a) which groups appear and (b) which pills appear
  // inside each — no "Voracity" path chip if no character has that path.
  const usedKeysByGroup = useMemo(() => {
    const knownKeys: Record<string, Set<string>> = {};
    for (const a of attributes) {
      (knownKeys[a.attr_type] ??= new Set()).add(a.key.toLowerCase());
    }
    const out: Record<string, Set<string>> = {};
    for (const item of items) {
      for (const g of groupDefs) {
        const raw = item.data[g.id];
        const vals = Array.isArray(raw)
          ? (raw as unknown[]).map((v) => String(v).toLowerCase())
          : raw != null
            ? [String(raw).toLowerCase()]
            : [];
        for (const val of vals) {
          if (val && knownKeys[g.attrType]?.has(val)) {
            (out[g.id] ??= new Set()).add(val);
          }
        }
      }
    }
    return out;
  }, [groupDefs, attributes, items]);

  const visibleGroups = useMemo(() => {
    const allowSet = allowedKeys ? new Set(allowedKeys) : null;
    // Backwards-compat: pre-fix allowlists stored attribute_types, so accept
    // either a field key (new) or an attribute_type (old) as a match.
    return groupDefs
      .filter((g) =>
        (usedKeysByGroup[g.id]?.size ?? 0) > 0 &&
        (!allowSet || allowSet.has(g.id) || allowSet.has(g.attrType))
      )
      .sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a.attrType);
        const bi = TYPE_ORDER.indexOf(b.attrType);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.label.localeCompare(b.label);
      });
  }, [groupDefs, usedKeysByGroup, allowedKeys]);

  const hasActive = Object.values(activeFilters).some(s => s.size > 0) || search.trim().length > 0;

  if (visibleGroups.length === 0 && items.length < 8) return null;

  return (
    <div className="mb-6 space-y-3">
      {/* Search */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Search by name…"
          className="flex-1 max-w-xs px-3 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:border-white"
        />
        {hasActive && (
          <button
            onClick={onClearAll}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded border border-gray-700 hover:border-gray-500 transition"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Filter groups */}
      {visibleGroups.map(group => {
        const used = usedKeysByGroup[group.id];
        const opts = attributes
          .filter(a => a.attr_type === group.attrType && used?.has(a.key.toLowerCase()))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
        const active = activeFilters[group.id] ?? new Set();
        return (
          <div key={group.id} className="flex items-start gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0 pt-2 capitalize">
              {typeLabel(group.label)}
            </span>
            {/* Mobile: horizontal scroll strip — desktop: wrapped rows */}
            <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap min-w-0 -mx-1 px-1 scrollbar-thin">
              {opts.map(attr => {
                const isActive = active.has(attr.key.toLowerCase());
                return (
                  <button
                    key={attr.key}
                    onClick={() => onFilterToggle(group.id, attr.key.toLowerCase())}
                    title={attr.name}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm border transition-all shrink-0 ${
                      isActive
                        ? "border-transparent text-white shadow-sm"
                        : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 bg-transparent"
                    }`}
                    style={isActive ? {
                      backgroundColor: attr.color ? `${attr.color}33` : "rgba(255,255,255,0.12)",
                      borderColor: attr.color ?? "#666",
                      color: attr.color ?? "white",
                    } : undefined}
                  >
                    {attr.icon_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={attr.icon_url} alt="" className="w-6 h-6 object-contain" />
                    ) : attr.color ? (
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: attr.color }}
                      />
                    ) : null}
                    {attr.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
