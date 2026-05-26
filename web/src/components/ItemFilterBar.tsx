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
    // Attribute filters — each active type must match (AND across types, OR within type)
    for (const [attrType, keys] of activeTypes) {
      const raw = item.data[attrType];
      const val = raw != null ? String(raw).toLowerCase() : "";
      if (!Array.from(keys).some(k => k.toLowerCase() === val)) return false;
    }
    return true;
  });
}

export default function ItemFilterBar({
  attributes,
  items,
  activeFilters,
  search,
  onFilterToggle,
  onClearAll,
  onSearchChange,
}: Props) {
  // Only show filter groups where ≥1 item actually has a value matching an attribute key
  const visibleGroups = useMemo(() => {
    const attrTypes = Array.from(new Set(attributes.map(a => a.attr_type)));
    const usedTypesSet = new Set<string>();
    for (const item of items) {
      for (const attrType of attrTypes) {
        const raw = item.data[attrType];
        const val = raw != null ? String(raw).toLowerCase() : "";
        if (val && attributes.some(a => a.attr_type === attrType && a.key.toLowerCase() === val)) {
          usedTypesSet.add(attrType);
        }
      }
    }
    const usedTypes = Array.from(usedTypesSet);
    return usedTypes.sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a);
      const bi = TYPE_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [attributes, items]);

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
        const opts = attributes
          .filter(a => a.attr_type === attrType)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
        const active = activeFilters[attrType] ?? new Set();
        return (
          <div key={attrType} className="flex items-start gap-3 flex-wrap">
            <span className="text-xs text-gray-500 w-20 shrink-0 pt-1.5 capitalize">
              {typeLabel(attrType)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {opts.map(attr => {
                const isActive = active.has(attr.key.toLowerCase());
                return (
                  <button
                    key={attr.key}
                    onClick={() => onFilterToggle(attrType, attr.key.toLowerCase())}
                    title={attr.name}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-all ${
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
                      <img src={attr.icon_url} alt="" className="w-3.5 h-3.5 object-contain" />
                    ) : attr.color ? (
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
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
