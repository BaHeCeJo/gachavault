"use client";

import { type AttrMap, type GameAttribute, lookupAttr } from "@/lib/attrs";
import { RARITY_CLASSES, RARITY_BADGE_FALLBACK } from "@/lib/theme";

// Shared detail-page render helpers. Moved verbatim out of ItemPageClient so
// both the legacy fixed layout and the new block renderer use one
// implementation of every field type.

export function AttrPill({ attr, value }: { attr: GameAttribute; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm"
      style={{
        backgroundColor: attr.color ? `${attr.color}22` : "rgba(255,255,255,0.08)",
        border: `1px solid ${attr.color ?? "#444"}44`,
        color: attr.color ?? "inherit",
      }}
    >
      {attr.icon_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attr.icon_url} alt={attr.name} className="w-7 h-7 object-contain" />
      )}
      {attr.name || value}
    </span>
  );
}

export function RarityStars({ value }: { value: unknown }) {
  if (typeof value === "number") {
    return (
      <div className="flex gap-0.5">
        {Array.from({ length: value }).map((_, i) => (
          <span key={i} className="text-yellow-400 text-lg">★</span>
        ))}
        {Array.from({ length: Math.max(0, 6 - value) }).map((_, i) => (
          <span key={i} className="text-gray-700 text-lg">★</span>
        ))}
      </div>
    );
  }
  const str = String(value).trim();
  // A numeric rarity stored as a string (e.g. "5") still renders as gold stars.
  if (/^\d+$/.test(str)) {
    const n = parseInt(str, 10);
    if (n > 0 && n <= 7) {
      return (
        <div className="flex gap-0.5">
          {Array.from({ length: n }).map((_, i) => (
            <span key={i} className="text-yellow-400 text-lg">★</span>
          ))}
        </div>
      );
    }
  }
  const badge = RARITY_CLASSES[str]?.badge ?? RARITY_BADGE_FALLBACK;
  return (
    <span className={`px-3 py-0.5 rounded-full text-sm font-semibold border ${badge}`}>
      {str}
    </span>
  );
}

export function itemHref(item: { id: string; slug: string; game_slug?: string; section_slug?: string }): string {
  if (item.game_slug && item.section_slug) {
    return `/games/${item.game_slug}/${item.section_slug}/${item.slug}`;
  }
  return `/items/${item.id}`;
}

export function FieldValue({
  fieldKey, value, attrMap, fieldType, fieldAttrType, resolvedRef, backRefItems, preview,
}: {
  fieldKey: string;
  value: unknown;
  attrMap: AttrMap;
  fieldType?: string;
  fieldAttrType?: string;
  resolvedRef?: { id: string; slug: string; name: string; game_slug?: string; section_slug?: string };
  backRefItems?: { id: string; slug: string; name: string; game_slug?: string; section_slug?: string }[];
  // In the admin live preview the cross-item lookups don't run, so render the
  // raw stored value instead of a perpetual "Loading…".
  preview?: boolean;
}) {
  if (fieldType === "backref") {
    if (!backRefItems || backRefItems.length === 0) return <span className="text-gray-600">—</span>;
    return (
      <div className="flex flex-col gap-1">
        {backRefItems.map((ref) => (
          <a
            key={ref.id}
            href={itemHref(ref)}
            className="text-amber-400 hover:text-amber-300 hover:underline text-sm transition"
          >
            {ref.name}
          </a>
        ))}
      </div>
    );
  }

  if (value === null || value === undefined || value === "") return <span className="text-gray-600">—</span>;

  if (fieldType === "itemlist") {
    type ItemEntry = { id: string; name: string; qty?: number; qty_min?: number; qty_max?: number };
    const entries: ItemEntry[] = Array.isArray(value) ? (value as ItemEntry[]) : [];
    if (entries.length === 0) return <span className="text-gray-600">—</span>;
    return (
      <div className="flex flex-col gap-1">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            {entry.id
              ? <a href={`/items/${entry.id}`} className="text-amber-400 hover:text-amber-300 hover:underline transition">{entry.name || entry.id}</a>
              : <span className="text-gray-300">{entry.name}</span>
            }
            <span className="text-gray-500 text-xs">
              {entry.qty_min !== undefined
                ? `×${entry.qty_min}–${entry.qty_max}`
                : entry.qty !== undefined ? `×${entry.qty}` : ""}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (fieldType === "resistances" && fieldAttrType) {
    const res = (value && typeof value === "object" && !Array.isArray(value))
      ? (value as Record<string, number | string>)
      : {};
    const attrs = Object.values(attrMap[fieldAttrType] ?? {});
    if (attrs.length === 0) return <span className="text-gray-600">—</span>;
    return (
      <div className="flex flex-wrap gap-1.5">
        {attrs.map((attr) => {
          const val = res[attr.key];
          if (val === undefined) return null;
          const isImmune = val === "immune";
          const num = typeof val === "number" ? val : 0;
          const color = isImmune ? "#888888"
            : num >= 100 ? "#ef4444"
            : num > 25 ? "#f97316"
            : num > 0 ? (attr.color ?? "#aaaaaa")
            : num < 0 ? "#22c55e"
            : "#6b7280";
          return (
            <span key={attr.key}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs"
              style={{ backgroundColor: `${color}20`, border: `1px solid ${color}50`, color }}
            >
              {attr.icon_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={attr.icon_url} alt={attr.name} className="w-3.5 h-3.5 object-contain" />
                : <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: attr.color ?? color }} />
              }
              {isImmune ? `${attr.name}: Immune` : `${attr.name}: ${num > 0 ? "+" : ""}${num}%`}
            </span>
          );
        })}
      </div>
    );
  }

  if (fieldType === "date" && typeof value === "string" && value) {
    const d = new Date(value);
    const formatted = isNaN(d.getTime()) ? value : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    return <span className="text-gray-200 text-sm">{formatted}</span>;
  }

  if (fieldType === "itemref") {
    if (resolvedRef) {
      return (
        <a href={itemHref(resolvedRef)} className="text-amber-400 hover:text-amber-300 hover:underline text-sm transition">
          {resolvedRef.name}
        </a>
      );
    }
    if (preview) return <span className="text-gray-300 text-sm">{String(value)}</span>;
    return <span className="text-gray-500 text-sm text-xs italic">Loading…</span>;
  }

  // Multi-value attribute: render each entry as its own pill.
  if (Array.isArray(value)) {
    const pills = value
      .map((v) => lookupAttr(attrMap, fieldKey, v))
      .filter((a): a is GameAttribute => a !== null);
    if (pills.length > 0) {
      return (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((a) => <AttrPill key={a.key} attr={a} value={a.key} />)}
        </div>
      );
    }
  }

  const attr = lookupAttr(attrMap, fieldKey, value);
  if (attr) return <AttrPill attr={attr} value={String(value)} />;

  if (fieldKey === "rarity") return <RarityStars value={value} />;

  if (fieldType === "image" && typeof value === "string" && value) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value}
        alt=""
        className="max-w-full max-h-80 rounded-lg object-contain"
        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
      />
    );
  }

  if (fieldKey === "image_url" || fieldKey === "icon_url") {
    return (
      <a href={String(value)} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline text-sm truncate max-w-xs block">
        {String(value)}
      </a>
    );
  }

  if (typeof value === "string" && value.length > 100) {
    return <p className="text-gray-300 text-sm leading-relaxed">{value}</p>;
  }

  return <span className="text-gray-200 text-sm">{String(value)}</span>;
}

export const HIDDEN_IN_DETAILS = new Set(["image_url", "icon_url", "name"]);
