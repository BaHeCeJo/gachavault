"use client";

import { useMemo } from "react";
import Link from "next/link";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient } from "@/lib/theme";
import {
  type AttrMap,
  type GameAttribute,
  type SchemaFieldLite,
  attributeFieldsByKey,
  firstValue,
  lookupAttr,
} from "@/lib/attrs";

// Per-schema card display config. Each *_attr is an attr_type string keyed
// off the schema's attribute-type fields; null/missing = use defaults.
export interface CardLayout {
  border_color_attr?: string | null;
  badge_top_left?: string | null;
  badge_top_right?: string | null;
  watermark_attr?: string | null;
  watermark_opacity?: number;
}

// Hardcoded fallbacks used when a schema has no card_layout configured —
// matches the gacha-style defaults that lived inline in GamePageClient.
const RARITY_GLOW: Record<string, string> = {
  SSR: "shadow-yellow-500/20",
  SR: "shadow-purple-500/20",
  UR: "shadow-yellow-500/20",
  S: "shadow-yellow-500/20",
  A: "shadow-purple-500/20",
};
const RARITY_BORDER: Record<string, string> = {
  SSR: "border-yellow-700/50",
  SR: "border-purple-700/50",
  UR: "border-yellow-700/50",
  S: "border-yellow-700/50",
  A: "border-purple-700/50",
};

interface ItemLike {
  id: string;
  slug: string;
  game_slug?: string;
  section_slug?: string;
  data: Record<string, unknown>;
}

interface Props {
  item: ItemLike;
  attrMap: AttrMap;
  layout?: CardLayout | null;
  // Schema fields the item's data adheres to. Each *_attr slot in `layout`
  // is a field key from this list; the field tells us which attribute pool
  // to draw the pill from (field.attribute_type) AND where the value lives
  // on the item (item.data[field.key]).
  schemaFields?: SchemaFieldLite[];
  // Fallback game slug used to build the item link when the item's own
  // section_slug isn't present (e.g. server bundles that don't join it).
  fallbackGameSlug?: string;
  // Override the href entirely (used by the admin preview).
  href?: string;
  // Suppress the link wrapper — useful for previews where the card is
  // a static visual, not navigable.
  noLink?: boolean;
  // Where the click target sits. "all" (default) wraps the whole card in
  // a link; "image" links only the image area, leaving the footer free
  // for interactive controls (collection edit/remove buttons).
  linkMode?: "all" | "image";
  // Extra content rendered below the name — used by the collection page
  // to host level/constellation info + edit/remove buttons.
  footer?: React.ReactNode;
}

// Resolve a slot's attribute pill. `slot` is a field key from the schema —
// we look up the field to learn (a) where the item stores its value
// (item.data[field.key]) and (b) which attribute pool to render from
// (field.attribute_type). If no schema is provided, fall back to treating
// the slot as both the data key and the attribute_type (legacy convention
// where field.key === field.attribute_type).
function slotAttr(
  map: AttrMap,
  item: ItemLike,
  slot: string | null | undefined,
  fieldsByKey: Record<string, SchemaFieldLite>,
): GameAttribute | null {
  if (!slot) return null;
  const field = fieldsByKey[slot];
  const dataKey = field?.key ?? slot;
  const attrType = field?.attribute_type ?? slot;
  return lookupAttr(map, attrType, firstValue(item.data[dataKey]));
}

function RarityBadge({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return (
      <span className="text-yellow-400 text-xs leading-none">
        {"★".repeat(Math.min(value, 6))}
      </span>
    );
  }
  const str = String(value);
  const colorMap: Record<string, string> = {
    SSR: "text-yellow-400",
    SR: "text-purple-400",
    R: "text-blue-400",
    S: "text-yellow-400",
  };
  return <span className={`text-xs font-semibold ${colorMap[str] ?? "text-gray-400"}`}>{str}</span>;
}

function AttrIcon({ attr, size = "md" }: { attr: GameAttribute; size?: "sm" | "md" }) {
  const px = size === "sm" ? "w-5 h-5" : "w-7 h-7";
  if (attr.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={attr.icon_url} alt={attr.name} title={attr.name} className={`${px} object-contain`} />;
  }
  return (
    <span
      title={attr.name}
      className={`${size === "sm" ? "w-3 h-3" : "w-5 h-5"} rounded-full inline-block border border-black/20`}
      style={{ backgroundColor: attr.color ?? "#888" }}
    />
  );
}

export default function ItemCard({
  item,
  attrMap,
  layout,
  schemaFields,
  fallbackGameSlug,
  href,
  noLink,
  linkMode = "all",
  footer,
}: Props) {
  const name = (item.data?.name as string) ?? item.slug;
  const imageUrl = (item.data?.image_url ?? item.data?.icon_url) as string | undefined;
  const rarity = item.data?.rarity;
  const rarityStr = typeof rarity === "number" ? undefined : String(rarity ?? "");

  const fieldsByKey = useMemo(
    () => (schemaFields ? attributeFieldsByKey(schemaFields) : {}),
    [schemaFields],
  );

  // Resolve each slot. When the schema's card_layout is set, the configured
  // field key wins; otherwise we fall back to legacy defaults: element top-
  // right, rarity-derived border classes. Border color from a configured
  // attribute always wins over the legacy RARITY_BORDER class.
  const isConfigured = !!layout;
  const borderAttr = slotAttr(attrMap, item, layout?.border_color_attr, fieldsByKey);
  const topLeftAttr = slotAttr(attrMap, item, layout?.badge_top_left, fieldsByKey);
  const topRightAttr = isConfigured
    ? slotAttr(attrMap, item, layout?.badge_top_right, fieldsByKey)
    : (slotAttr(attrMap, item, "element", fieldsByKey) ?? slotAttr(attrMap, item, "attribute", fieldsByKey));
  const watermarkAttr = slotAttr(attrMap, item, layout?.watermark_attr, fieldsByKey);
  const watermarkOpacity = layout?.watermark_opacity ?? 0.3;

  const legacyBorderClass =
    !borderAttr && rarityStr && RARITY_BORDER[rarityStr]
      ? `${RARITY_BORDER[rarityStr]} hover:shadow-lg ${RARITY_GLOW[rarityStr]}`
      : "border-gray-800 hover:border-amber-500/60 hover:shadow-amber-500/10";

  const cardStyle: React.CSSProperties | undefined = borderAttr?.color
    ? { borderColor: borderAttr.color, boxShadow: `0 0 0 1px ${borderAttr.color}20` }
    : undefined;

  const link = href
    ?? (item.game_slug && item.section_slug
      ? `/games/${item.game_slug}/${item.section_slug}/${item.slug}`
      : `/games/${fallbackGameSlug ?? item.game_slug ?? ""}/items/${item.id}`);

  const imageArea = (
    <div className="relative h-28 w-full overflow-hidden">
      {/* Watermark sits below the portrait — a large faded attribute icon
          (e.g. the path silhouette behind the character). */}
      {watermarkAttr?.icon_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={watermarkAttr.icon_url}
          alt=""
          aria-hidden
          className="absolute inset-0 m-auto w-24 h-24 object-contain pointer-events-none"
          style={{ opacity: watermarkOpacity }}
        />
      )}
      <SafeImage
        src={imageUrl}
        alt={name}
        fill
        sizes="(min-width: 1024px) 200px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
        className="object-cover group-hover:scale-105 transition-transform duration-200"
        fallback={
          <div className={`h-full w-full bg-gradient-to-br ${cardGradient(name)} flex items-center justify-center text-2xl font-semibold text-white/50`}>
            {name[0]?.toUpperCase()}
          </div>
        }
      />
      {topLeftAttr && (
        <div className="absolute top-1.5 left-1.5 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
          <AttrIcon attr={topLeftAttr} />
        </div>
      )}
      {topRightAttr && (
        <div className="absolute top-1.5 right-1.5 w-9 h-9 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
          <AttrIcon attr={topRightAttr} />
        </div>
      )}
      {rarity !== undefined && (
        <div className="absolute bottom-1 left-1.5">
          <RarityBadge value={rarity} />
        </div>
      )}
    </div>
  );

  const cardClass = `flex flex-col rounded-lg border bg-gray-900 overflow-hidden transition-all duration-200 group ${
    noLink ? "" : "hover:scale-[1.03] hover:shadow-lg"
  } ${borderAttr ? "" : legacyBorderClass}`;

  // "image" link mode: only the portrait is clickable, the footer stays free
  // for buttons. Used by the collection page.
  if (linkMode === "image" && !noLink) {
    return (
      <div className={cardClass} style={cardStyle}>
        <Link href={link} className="block">
          {imageArea}
        </Link>
        <div className="px-2 py-1.5">
          <p className="text-xs truncate">{name}</p>
          {footer}
        </div>
      </div>
    );
  }

  const inner = (
    <div className={cardClass} style={cardStyle}>
      {imageArea}
      <div className="px-2 py-1.5">
        <p className="text-xs truncate">{name}</p>
        {footer}
      </div>
    </div>
  );

  if (noLink) return inner;
  return (
    <Link key={item.id} href={link} className="block">
      {inner}
    </Link>
  );
}
