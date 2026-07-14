"use client";

import { SafeImage } from "@/components/SafeImage";
import { imageFocus, imageZoom } from "@/lib/imageFocus";
import { cardGradient } from "@/lib/theme";
import { type AttrMap, type GameAttribute, lookupAttr } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import { AttrPill, RarityStars } from "@/components/detail/FieldValue";
import type { HeroConfig } from "@/lib/pageLayout";
import type { SchemaField } from "@/components/detail/types";

// Art + name + rarity + attribute badge pills. The portrait and the title.
export function HeroBlock({
  config,
  bundle,
  attrMap,
}: {
  config?: Record<string, unknown>;
  bundle: ItemPageBundle;
  attrMap: AttrMap;
}) {
  const c = (config ?? {}) as HeroConfig;
  const data = bundle.item.data as Record<string, unknown>;
  const name = (data[c.name_field || "name"] as string) || bundle.item.slug;
  const asStr = (v: unknown) => (typeof v === "string" && v.trim() ? (v as string) : undefined);
  const splash = asStr(data.image_url);
  const fullart = asStr(data.fullart_url);
  const configured = c.image_field ? asStr(data[c.image_field]) : undefined;
  // Hero prefers transparent full art (rendered over a blurred splash backdrop),
  // else the configured/splash art. Legacy items (only image_url) keep the plain
  // object-cover look.
  const imageUrl = configured ?? fullart ?? splash ?? asStr(data.icon_url);
  const isFullart = !!fullart && imageUrl === fullart;
  const rarity = data[c.rarity_field || "rarity"];
  const sectionName = bundle.sectionName;

  // A badge field's value lives at data[key], but the matching attribute pool
  // is keyed by the schema field's attribute_type — which is NOT always the key
  // (HSR's `element` field draws from attribute_type `type`). Resolve it from
  // the schema; fall back to the key when they coincide (path, availability…).
  const fieldByKey = new Map(((bundle.fields ?? []) as SchemaField[]).map((f) => [f.key, f]));
  const badges: GameAttribute[] = [];
  for (const key of c.badge_fields ?? []) {
    const attrType = fieldByKey.get(key)?.attribute_type ?? key;
    const v = data[key];
    if (Array.isArray(v)) {
      for (const entry of v) {
        const a = lookupAttr(attrMap, attrType, entry);
        if (a) badges.push(a);
      }
    } else {
      const a = lookupAttr(attrMap, attrType, v);
      if (a) badges.push(a);
    }
  }

  const rarityStr = typeof rarity === "number" ? undefined : String(rarity ?? "");
  const rarityBorder = rarityStr
    ? ({ SSR: "border-yellow-600/40", SR: "border-purple-600/40", UR: "border-yellow-600/40", S: "border-yellow-600/40", A: "border-purple-600/40" }[rarityStr] ?? "border-gray-800")
    : "border-gray-800";

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 md:gap-8 mb-8">
      <div className="w-full max-w-[220px] mx-auto md:mx-0 md:max-w-none">
        <div className={`rounded-xl overflow-hidden border bg-gray-900 shadow-lg ${rarityBorder}`}>
          {!imageUrl ? (
            <div className={`h-64 bg-gradient-to-br ${cardGradient(name)} flex items-center justify-center text-6xl font-semibold text-white/40`}>
              {name[0]?.toUpperCase()}
            </div>
          ) : isFullart ? (
            // Transparent full art, centered over a blurred splash backdrop.
            <div className="relative aspect-[3/4]">
              {splash && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={splash} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover scale-125 blur-2xl opacity-40" />
              )}
              <SafeImage src={imageUrl} alt={name} fill priority sizes="(min-width: 768px) 280px, 100vw" className="relative object-contain p-2" fallback={
                <div className={`h-full bg-gradient-to-br ${cardGradient(name)} flex items-center justify-center text-6xl font-semibold text-white/40`}>
                  {name[0]?.toUpperCase()}
                </div>
              } />
            </div>
          ) : (
            <SafeImage src={imageUrl} alt={name} width={400} height={400} priority sizes="(min-width: 768px) 280px, 100vw" focus={imageFocus(data, ["image_url", "icon_url"])} zoom={imageZoom(data, ["image_url", "icon_url"])} className="w-full object-cover" fallback={
              <div className={`h-64 bg-gradient-to-br ${cardGradient(name)} flex items-center justify-center text-6xl font-semibold text-white/40`}>
                {name[0]?.toUpperCase()}
              </div>
            } />
          )}
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-semibold mb-2">{name}</h1>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {c.show_section_tag && sectionName && (
            <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-300">{sectionName}</span>
          )}
          {rarity !== undefined && rarity !== "" && <RarityStars value={rarity} />}
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {badges.map((a, i) => <AttrPill key={`${a.key}-${i}`} attr={a} value={a.key} />)}
          </div>
        )}
      </div>
    </div>
  );
}
