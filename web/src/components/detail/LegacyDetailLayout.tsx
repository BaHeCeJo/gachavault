"use client";

import Link from "next/link";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient } from "@/lib/theme";
import { type AttrMap, lookupAttr } from "@/lib/attrs";
import type { ItemPageBundle } from "@/lib/seo";
import { FieldValue, RarityStars, itemHref, HIDDEN_IN_DETAILS } from "@/components/detail/FieldValue";
import type { Item, ItemRelations, SchemaField } from "@/components/detail/types";

// The original fixed detail layout, moved here verbatim MINUS its outer
// <main> wrapper (the orchestrator / block renderer owns that). This is both
// the `null`-page fallback and what the `legacy` block renders, so "unchanged"
// is guaranteed by construction — there is exactly one copy of this markup.
export function LegacyDetailLayout({
  bundle,
  preview,
  relations,
  attrMap,
}: {
  bundle: ItemPageBundle;
  preview: boolean;
  relations: ItemRelations;
  attrMap: AttrMap;
}) {
  const item = bundle.item as Item;
  const slug = item.game_slug;
  const gameName = bundle.game?.name ?? slug;
  const sectionName = bundle.sectionName;
  const fields = bundle.fields as SchemaField[];
  const { relatedItems, resolvedRefs, backRefs } = relations;

  const name = (item.data?.name as string) ?? item.slug;
  const imageUrl = item.data?.image_url as string | undefined;
  const iconUrl = item.data?.icon_url as string | undefined;

  const orderedFields: { key: string; label: string; type?: string; attribute_type?: string; source_section?: string; source_field?: string }[] = fields.length > 0
    ? fields.filter(f => !HIDDEN_IN_DETAILS.has(f.key)).map(f => ({ key: f.key, label: f.label, type: f.type, attribute_type: f.attribute_type, source_section: f.source_section, source_field: f.source_field }))
    : Object.keys(item.data).filter(k => !HIDDEN_IN_DETAILS.has(k)).map(k => ({ key: k, label: k.replace(/_/g, " ") }));

  const rarityStr = typeof item.data?.rarity === "number" ? undefined : String(item.data?.rarity ?? "");
  const rarityBorder = rarityStr ? ({ SSR: "border-yellow-600/40", SR: "border-purple-600/40", UR: "border-yellow-600/40", S: "border-yellow-600/40", A: "border-purple-600/40" }[rarityStr] ?? "border-gray-800") : "border-gray-800";
  const rarityGlow = rarityStr ? ({ SSR: "shadow-yellow-500/15", SR: "shadow-purple-500/15", UR: "shadow-yellow-500/15" }[rarityStr] ?? "") : "";

  return (
    <>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-400 flex-wrap">
        <Link href="/games" className="hover:text-amber-300 transition">Games</Link>
        <span className="text-gray-700">/</span>
        <Link href={`/games/${slug}`} className="hover:text-amber-300 transition">{gameName}</Link>
        {sectionName && (
          <>
            <span className="text-gray-700">/</span>
            <span className="text-gray-400">{sectionName}</span>
          </>
        )}
        <span className="text-gray-700">/</span>
        <span className="text-white">{name}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 md:gap-8 mb-12">
        {/* Left: image — capped width and centered on mobile so the stats block stays above the fold */}
        <div className="flex flex-col gap-4 w-full max-w-[220px] mx-auto md:mx-0 md:max-w-none">
          <div className={`rounded-xl overflow-hidden border bg-gray-900 shadow-lg ${rarityBorder} ${rarityGlow}`}>
            {imageUrl ? (
              <SafeImage src={imageUrl} alt={name} width={400} height={400} priority sizes="(min-width: 768px) 280px, 100vw" className="w-full object-cover" fallback={
                <div className={`h-64 bg-gradient-to-br ${cardGradient(name)} flex items-center justify-center text-6xl font-semibold text-white/40`}>
                  {name[0]?.toUpperCase()}
                </div>
              } />
            ) : iconUrl ? (
              <SafeImage src={iconUrl} alt={name} width={400} height={400} priority sizes="(min-width: 768px) 280px, 100vw" className="w-full object-contain p-6" fallback={
                <div className={`h-64 bg-gradient-to-br ${cardGradient(name)} flex items-center justify-center text-6xl font-semibold text-white/40`}>
                  {name[0]?.toUpperCase()}
                </div>
              } />
            ) : (
              <div className={`h-64 bg-gradient-to-br ${cardGradient(name)} flex items-center justify-center text-6xl font-semibold text-white/40`}>
                {name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          {iconUrl && imageUrl && (
            <SafeImage src={iconUrl} alt={`${name} icon`} width={64} height={64} className="w-16 h-16 rounded-lg border border-gray-700 object-contain self-start" />
          )}
        </div>

        {/* Right: details */}
        <div>
          <h1 className="text-3xl font-semibold mb-1">{name}</h1>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {sectionName && (
              <span className="text-xs px-2 py-0.5 rounded bg-amber-900/40 border border-amber-700/40 text-amber-300">{sectionName}</span>
            )}
            {item.data?.rarity !== undefined && <RarityStars value={item.data.rarity} />}
          </div>

          {/* Stats table — above the fold so the "should I pull / build this?" answer lands first */}
          <div className="rounded-xl border border-gray-800 overflow-hidden mb-6">
            {orderedFields.filter(f => f.key !== "description" && f.key !== "lore").map(({ key, label, type, attribute_type }, i) => {
              const value = item.data[key];
              const isBackref = type === "backref";
              if (!isBackref && (value === undefined || value === null || value === "")) return null;
              return (
                <div
                  key={key}
                  className={`flex items-start gap-4 px-4 py-3 ${i % 2 === 0 ? "bg-gray-900/60" : "bg-gray-900/30"}`}
                >
                  <span className="text-gray-400 text-sm w-24 sm:w-32 shrink-0 capitalize pt-0.5">
                    {label}
                  </span>
                  <div className="flex-1">
                    <FieldValue
                      fieldKey={key}
                      value={value}
                      attrMap={attrMap}
                      fieldType={type}
                      fieldAttrType={attribute_type}
                      resolvedRef={type === "itemref" ? resolvedRefs.get(String(value)) : undefined}
                      backRefItems={isBackref ? (backRefs.get(key) ?? []) : undefined}
                      preview={preview}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {typeof item.data?.description === "string" && item.data.description && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">Description</h2>
              <p className="text-gray-300 text-sm leading-relaxed border-l-2 border-amber-500/60 pl-4 italic">
                {item.data.description}
              </p>
            </section>
          )}

          {typeof item.data?.lore === "string" && item.data.lore && (
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">Lore</h2>
              <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                {item.data.lore}
              </p>
            </section>
          )}
        </div>
      </div>

      {/* Related items */}
      {!preview && relatedItems.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">More {sectionName || "Items"}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {relatedItems.slice(0, 12).map((rel) => {
              const relName = (rel.data?.name as string) ?? rel.slug;
              const relImg = (rel.data?.image_url ?? rel.data?.icon_url) as string | undefined;
              const relRarity = rel.data?.rarity;
              const relFirstEl = Array.isArray(rel.data?.element) ? rel.data.element[0] : rel.data?.element;
              const relElem = lookupAttr(attrMap, "element", relFirstEl)
                ?? Object.keys(rel.data ?? {}).map(k => {
                  const v = rel.data[k];
                  return lookupAttr(attrMap, k, Array.isArray(v) ? v[0] : v);
                }).find(Boolean) ?? null;
              return (
                <Link
                  key={rel.id}
                  href={itemHref(rel)}
                  className="flex flex-col rounded-lg border border-gray-800 bg-gray-900 overflow-hidden hover:border-amber-500/60 hover:shadow-md hover:shadow-amber-500/10 hover:scale-[1.03] transition-all duration-200 group"
                >
                  <div className="relative h-20">
                    <SafeImage src={relImg} alt={relName} fill sizes="(min-width: 768px) 140px, (min-width: 640px) 25vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-200" fallback={
                      <div className={`h-full bg-gradient-to-br ${cardGradient(relName)} flex items-center justify-center text-xl font-semibold text-white/50`}>
                        {relName[0]?.toUpperCase()}
                      </div>
                    } />
                    {relElem && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center">
                        {relElem.icon_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={relElem.icon_url} alt={relElem.name} className="w-3.5 h-3.5 object-contain" />
                          : <span className="w-3 h-3 rounded-full block" style={{ backgroundColor: relElem.color ?? "#888" }} />
                        }
                      </div>
                    )}
                    {relRarity !== undefined && (
                      <div className="absolute bottom-0.5 left-1">
                        {typeof relRarity === "number"
                          ? <span className="text-yellow-400 text-xs">{"★".repeat(Math.min(relRarity, 6))}</span>
                          : <span className="text-yellow-400 text-xs font-semibold">{String(relRarity)}</span>
                        }
                      </div>
                    )}
                  </div>
                  <p className="px-1.5 py-1 text-xs truncate">{relName}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
