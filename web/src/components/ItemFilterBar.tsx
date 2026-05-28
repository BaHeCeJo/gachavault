"use client";

import { useMemo } from "react";

export interface GameAttribute {
  id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
  sort_order?: number;
}

// filters: { [attr_type]: Set<key> }
export type ActiveFilters = Record<string, Set<string>>;

interface Props {
  attributes: GameAttribute[];
  items: { data: Record<string, unknown> }[];
  activeFilters: ActiveFilters;
  search: string;
  // Allowlist of attr_types to show as filter chip groups. `null` (or
  // undefined) means "auto" — every attr_type with values shows up.
  allowedAttrTypes?: string[] | null;
  onFilterToggle: (attrType: string, key: string) => void;
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
  const activeTypes = Object.entries(activeFilters).filter(([, s]) => s.size > 0);
  return items.filter((item) => {
    // Name search
    if (search.trim()) {
      const name = (item.data?.name as string ?? "").toLowerCase();
      if (!name.includes(search.toLowerCase().trim())) return false;
    }
    // Attribute filters — each active type must match (AND across types, OR within type).
    // Items may store the value as a single string or as an array (multi attribute);
    // a match in either case means "this item has one of the selected values".
    for (const [attrType, keys] of activeTypes) {
      const raw = item.data[attrType];
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
  allowedAttrTypes,
  onFilterToggle,
  onClearAll,
  onSearchChange,
}: Props) {
  // Per attr_type, the set of attribute keys that ≥1 item actually has a
  // value for. Used to (a) decide which groups appear and (b) hide pills
  // for keys nobody has — e.g. don't show the "Voracity path" chip when no
  // character in the section has that path.
  const usedKeysByType = useMemo(() => {
    const attrTypes = Array.from(new Set(attributes.map(a => a.attr_type)));
    const knownKeys: Record<string, Set<string>> = {};
    for (const a of attributes) {
      (knownKeys[a.attr_type] ??= new Set()).add(a.key.toLowerCase());
    }
    const usedKeys: Record<string, Set<string>> = {};
    for (const item of items) {
      for (const attrType of attrTypes) {
        const raw = item.data[attrType];
        const vals = Array.isArray(raw)
          ? (raw as unknown[]).map((v) => String(v).toLowerCase())
          : raw != null
            ? [String(raw).toLowerCase()]
            : [];
        for (const val of vals) {
          if (val && knownKeys[attrType]?.has(val)) {
            (usedKeys[attrType] ??= new Set()).add(val);
          }
        }
      }
    }
    return usedKeys;
  }, [attributes, items]);

  const visibleGroups = useMemo(() => {
    const allowSet = allowedAttrTypes ? new Set(allowedAttrTypes) : null;
    const usedTypes = Object.entries(usedKeysByType)
      .filter(([attrType, keys]) => keys.size > 0 && (!allowSet || allowSet.has(attrType)))
      .map(([attrType]) => attrType);
    return usedTypes.sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a);
      const bi = TYPE_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [usedKeysByType, allowedAttrTypes]);

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
      {visibleGroups.map(attrType => {
        const used = usedKeysByType[attrType];
        const opts = attributes
          .filter(a => a.attr_type === attrType && used?.has(a.key.toLowerCase()))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
        const active = activeFilters[attrType] ?? new Set();
        return (
          <div key={attrType} className="flex items-start gap-3">
            <span className="text-xs text-gray-500 w-20 shrink-0 pt-2 capitalize">
              {typeLabel(attrType)}
            </span>
            {/* Mobile: horizontal scroll strip — desktop: wrapped rows */}
            <div className="flex gap-1.5 overflow-x-auto sm:flex-wrap min-w-0 -mx-1 px-1 scrollbar-thin">
              {opts.map(attr => {
                const isActive = active.has(attr.key.toLowerCase());
                return (
                  <button
                    key={attr.key}
                    onClick={() => onFilterToggle(attrType, attr.key.toLowerCase())}
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
