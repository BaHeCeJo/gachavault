"use client";

import { useMemo } from "react";
import Link from "next/link";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient, RARITY_CLASSES } from "@/lib/theme";
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
  // Drives the card body fill (e.g. rarity → tinted card background). When
  // set it produces a prominent, full-card tint; the border slot only tints
  // the chrome edges. Leave null to keep the plain gray body.
  background_color_attr?: string | null;
  badge_top_left?: string | null;
  badge_top_right?: string | null;
  watermark_attr?: string | null;
  watermark_opacity?: number;
}

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

// Resolve a slot's attribute pill. `slot` is normally a schema field key —
// we use field.key for the data lookup and field.attribute_type for the
// pill pool. Backwards-compat: configs saved before the field-key fix
// stored attribute_type values, so if `slot` doesn't match a field key,
// try matching it against any attribute-type field's attribute_type and
// use that field instead.
function slotAttr(
  map: AttrMap,
  item: ItemLike,
  slot: string | null | undefined,
  fieldsByKey: Record<string, SchemaFieldLite>,
  allFields: SchemaFieldLite[] | undefined,
): GameAttribute | null {
  if (!slot) return null;
  let field: SchemaFieldLite | undefined = fieldsByKey[slot];
  if (!field && allFields) {
    field = allFields.find((f) => f.type === "attribute" && f.attribute_type === slot);
  }
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
  const borderAttr = slotAttr(attrMap, item, layout?.border_color_attr, fieldsByKey, schemaFields);
  const bgAttr = slotAttr(attrMap, item, layout?.background_color_attr, fieldsByKey, schemaFields);
  const topLeftAttr = slotAttr(attrMap, item, layout?.badge_top_left, fieldsByKey, schemaFields);
  const topRightAttr = isConfigured
    ? slotAttr(attrMap, item, layout?.badge_top_right, fieldsByKey, schemaFields)
    : (slotAttr(attrMap, item, "element", fieldsByKey, schemaFields) ?? slotAttr(attrMap, item, "attribute", fieldsByKey, schemaFields));
  const watermarkAttr = slotAttr(attrMap, item, layout?.watermark_attr, fieldsByKey, schemaFields);
  const watermarkOpacity = layout?.watermark_opacity ?? 0.3;

  // If rarity is already represented somewhere on the card (e.g. as the
  // border color), hide the textual stars/badge — the visual already
  // conveys it and the duplication just clutters the corner.
  const rarityRepresented = isConfigured && [
    layout?.border_color_attr,
    layout?.background_color_attr,
    layout?.badge_top_left,
    layout?.badge_top_right,
    layout?.watermark_attr,
  ].includes("rarity");
  const showRarity = rarity !== undefined && !rarityRepresented;

  const legacyBorderClass =
    !borderAttr && rarityStr && RARITY_CLASSES[rarityStr]
      ? `${RARITY_CLASSES[rarityStr].border} hover:shadow-lg ${RARITY_CLASSES[rarityStr].glow}`
      : "border-gray-800 hover:border-amber-500/60 hover:shadow-amber-500/10";

  // Two independent color drivers:
  //  - borderAttr tints the card edges (border + glow) and, for backwards
  //    compat with configs that only set a border color, adds a faint body
  //    tint.
  //  - bgAttr (the dedicated "Background color" slot) fills the card body
  //    prominently. The portrait covers the top, so the body color is most
  //    visible in the footer; we also fade the image bottom into it (below)
  //    so the whole card reads as colored, not just a thin strip.
  // Whichever color drives the fill, layer it over a solid gray base so the
  // tint survives across the full card height.
  const fillColor = bgAttr?.color ?? borderAttr?.color;
  const strongFill = !!bgAttr?.color;
  const cardStyle: React.CSSProperties | undefined =
    borderAttr?.color || fillColor
      ? {
          ...(borderAttr?.color
            ? {
                borderColor: borderAttr.color,
                boxShadow: `0 0 0 1px ${borderAttr.color}30, 0 4px 12px -2px ${borderAttr.color}30`,
              }
            : {}),
          ...(fillColor
            ? {
                background: strongFill
                  ? `linear-gradient(180deg, ${fillColor}59 0%, ${fillColor}3d 100%), rgb(17,24,39)`
                  : `linear-gradient(180deg, ${fillColor}33 0%, ${fillColor}1f 100%), rgb(17,24,39)`,
              }
            : {}),
        }
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
      {/* Blend the portrait's bottom edge into the colored card body so the
          background tint reads as one continuous fill rather than stopping
          at a hard line above the footer. */}
      {strongFill && fillColor && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
          style={{ background: `linear-gradient(to top, ${fillColor}b3, transparent)` }}
        />
      )}
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
      {showRarity && (
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
        <div className="px-2 py-2">
          <p className="text-sm font-medium text-center truncate leading-snug">{name}</p>
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
