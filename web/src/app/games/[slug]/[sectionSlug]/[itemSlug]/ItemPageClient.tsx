"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { gamesApi, itemsApi } from "@/lib/api";
import { SafeImage } from "@/components/SafeImage";
import type { ItemPageBundle } from "@/lib/seo";

interface Item {
  id: string;
  slug: string;
  game_id: string;
  game_slug: string;
  section_id: string;
  section_slug: string;
  type_schema_id: string | null;
  data: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

interface ItemFull {
  id: string;
  slug: string;
  game_id: string;
  game_slug: string;
  section_id: string;
  section_slug: string;
  data: Record<string, unknown>;
}

interface SchemaField {
  key: string;
  label: string;
  type: string;
  attribute_type?: string;
  item_section?: string;
  qty_range?: boolean;
  source_section?: string;
  source_field?: string;
  sources?: { source_section: string; source_field: string }[];
}

interface GameAttribute {
  id: string;
  attr_type: string;
  key: string;
  name: string;
  icon_url: string | null;
  color: string | null;
}

type AttrMap = Record<string, Record<string, GameAttribute>>;

function buildAttrMap(attrs: GameAttribute[]): AttrMap {
  const map: AttrMap = {};
  for (const a of attrs) {
    if (!map[a.attr_type]) map[a.attr_type] = {};
    map[a.attr_type][a.key.toLowerCase()] = a;
  }
  return map;
}

function lookupAttr(map: AttrMap, attrType: string, value: unknown): GameAttribute | null {
  if (typeof value !== "string") return null;
  return map[attrType]?.[value.toLowerCase()] ?? null;
}

function AttrPill({ attr, value }: { attr: GameAttribute; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm"
      style={{
        backgroundColor: attr.color ? `${attr.color}22` : "rgba(255,255,255,0.08)",
        border: `1px solid ${attr.color ?? "#444"}44`,
        color: attr.color ?? "inherit",
      }}
    >
      {attr.icon_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={attr.icon_url} alt={attr.name} className="w-4 h-4 object-contain" />
      )}
      {attr.name || value}
    </span>
  );
}

function RarityStars({ value }: { value: unknown }) {
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
  const str = String(value);
  const colorMap: Record<string, string> = {
    SSR: "text-yellow-400 border-yellow-700 bg-yellow-900/20",
    SR: "text-purple-400 border-purple-700 bg-purple-900/20",
    R: "text-blue-400 border-blue-700 bg-blue-900/20",
    S: "text-yellow-400 border-yellow-700 bg-yellow-900/20",
    A: "text-purple-400 border-purple-700 bg-purple-900/20",
  };
  return (
    <span className={`px-3 py-0.5 rounded-full text-sm font-semibold border ${colorMap[str] ?? "text-gray-400 border-gray-700 bg-gray-800"}`}>
      {str}
    </span>
  );
}

function itemHref(item: { id: string; slug: string; game_slug?: string; section_slug?: string }): string {
  if (item.game_slug && item.section_slug) {
    return `/games/${item.game_slug}/${item.section_slug}/${item.slug}`;
  }
  return `/items/${item.id}`;
}

function FieldValue({
  fieldKey, value, attrMap, fieldType, fieldAttrType, resolvedRef, backRefItems,
}: {
  fieldKey: string;
  value: unknown;
  attrMap: AttrMap;
  fieldType?: string;
  fieldAttrType?: string;
  resolvedRef?: { id: string; slug: string; name: string; game_slug?: string; section_slug?: string };
  backRefItems?: { id: string; slug: string; name: string; game_slug?: string; section_slug?: string }[];
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
    return <span className="text-gray-500 text-sm text-xs italic">Loading…</span>;
  }

  const attr = lookupAttr(attrMap, fieldKey, value);
  if (attr) return <AttrPill attr={attr} value={String(value)} />;

  if (fieldKey === "rarity") return <RarityStars value={value} />;

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

const HIDDEN_IN_DETAILS = new Set(["image_url", "icon_url", "name"]);

interface ClientProps {
  initial: ItemPageBundle;
}

export default function ItemPageClient({ initial }: ClientProps) {
  const item = initial.item as Item;
  const slug = item.game_slug;
  const itemSlug = item.slug;
  const gameName = initial.game?.name ?? slug;
  const sectionName = initial.sectionName;
  const fields = initial.fields as SchemaField[];
  const attrMap = useMemo(() => buildAttrMap(initial.attributes), [initial.attributes]);

  const [relatedItems, setRelatedItems] = useState<ItemFull[]>([]);
  const [resolvedRefs, setResolvedRefs] = useState<Map<string, { id: string; slug: string; name: string; game_slug?: string; section_slug?: string }>>(new Map());
  const [backRefs, setBackRefs] = useState<Map<string, { id: string; slug: string; name: string; game_slug?: string; section_slug?: string }[]>>(new Map());

  useEffect(() => {
    // Primary data is already server-rendered via initial. This effect only
    // hydrates secondary data the SSR pass intentionally skips: cross-item
    // refs, backrefs (which require scanning whole sections), and the
    // related-items grid.
    const it = item;

    const itemrefIds = fields
      .filter((f) => f.type === "itemref")
      .map((f) => it.data[f.key])
      .filter((v): v is string => typeof v === "string" && v.length > 0);
    if (itemrefIds.length > 0) {
      Promise.all(itemrefIds.map((refId) => itemsApi.get(refId).catch(() => null)))
        .then((results) => {
          const map = new Map<string, { id: string; slug: string; name: string; game_slug?: string; section_slug?: string }>();
          results.forEach((r, i) => {
            if (r?.data?.data) {
              const refItem = r.data.data;
              map.set(itemrefIds[i], {
                id: refItem.id,
                slug: refItem.slug,
                name: (refItem.data?.name as string) ?? refItem.slug,
                game_slug: refItem.game_slug,
                section_slug: refItem.section_slug,
              });
            }
          });
          setResolvedRefs(map);
        })
        .catch(() => {});
    }

    const getFieldSources = (f: SchemaField) =>
      f.sources?.length
        ? f.sources
        : f.source_section && f.source_field
          ? [{ source_section: f.source_section, source_field: f.source_field }]
          : [];
    const backrefFields = fields.filter((f) => f.type === "backref" && getFieldSources(f).length > 0);
    if (backrefFields.length > 0) {
      const allSources = backrefFields.flatMap(getFieldSources);
      const uniqueSlugs = Array.from(new Set(allSources.map((s) => s.source_section)));
      (async () => {
        const sectionsRes = await gamesApi.getSections(slug).catch(() => null);
        const sections: Array<{ id: string; slug: string }> = sectionsRes?.data?.data ?? [];
        const results = await Promise.all(
          uniqueSlugs.map(async (secSlug) => {
            const section = sections.find((s) => s.slug === secSlug);
            if (!section) return [secSlug, []] as [string, ItemFull[]];
            const sourceItems = await itemsApi.listAll<ItemFull>({ game_id: it.game_id, section_id: section.id });
            return [secSlug, sourceItems] as [string, ItemFull[]];
          })
        );
        const sectionItems = new Map<string, ItemFull[]>(results);
        const newBackRefs = new Map<string, { id: string; slug: string; name: string; game_slug?: string; section_slug?: string }[]>();
        for (const field of backrefFields) {
          const seen = new Set<string>();
          const matching: { id: string; slug: string; name: string; game_slug?: string; section_slug?: string }[] = [];
          for (const src of getFieldSources(field)) {
            const sourceItems = sectionItems.get(src.source_section) ?? [];
            for (const sourceItem of sourceItems) {
              if (seen.has(sourceItem.id)) continue;
              const fieldValue = sourceItem.data[src.source_field];
              const matches = Array.isArray(fieldValue)
                ? (fieldValue as { id?: string }[]).some((entry) => entry.id === it.id)
                : fieldValue === it.id;
              if (matches) {
                seen.add(sourceItem.id);
                matching.push({
                  id: sourceItem.id,
                  slug: sourceItem.slug,
                  name: (sourceItem.data?.name as string) ?? sourceItem.slug,
                  game_slug: sourceItem.game_slug,
                  section_slug: sourceItem.section_slug,
                });
              }
            }
          }
          newBackRefs.set(field.key, matching);
        }
        setBackRefs(newBackRefs);
      })().catch(() => {});
    }

    itemsApi
      .list({ game_id: it.game_id, section_id: it.section_id, limit: 12, offset: 0 })
      .then((relRes) => {
        if (relRes?.data?.data) {
          setRelatedItems((relRes.data.data as ItemFull[]).filter((r: ItemFull) => r.slug !== itemSlug));
        }
      })
      .catch(() => {});
  }, [item, fields, slug, itemSlug]);

  const name = (item.data?.name as string) ?? item.slug;
  const imageUrl = item.data?.image_url as string | undefined;
  const iconUrl = item.data?.icon_url as string | undefined;

  const orderedFields: { key: string; label: string; type?: string; attribute_type?: string; source_section?: string; source_field?: string }[] = fields.length > 0
    ? fields.filter(f => !HIDDEN_IN_DETAILS.has(f.key)).map(f => ({ key: f.key, label: f.label, type: f.type, attribute_type: f.attribute_type, source_section: f.source_section, source_field: f.source_field }))
    : Object.keys(item.data).filter(k => !HIDDEN_IN_DETAILS.has(k)).map(k => ({ key: k, label: k.replace(/_/g, " ") }));

  const rarityStr = typeof item.data?.rarity === "number" ? undefined : String(item.data?.rarity ?? "");
  const rarityBorder = rarityStr ? ({ SSR: "border-yellow-600/40", SR: "border-purple-600/40", UR: "border-yellow-600/40", S: "border-yellow-600/40", A: "border-purple-600/40" }[rarityStr] ?? "border-gray-800") : "border-gray-800";
  const rarityGlow = rarityStr ? ({ SSR: "shadow-yellow-500/15", SR: "shadow-purple-500/15", UR: "shadow-yellow-500/15" }[rarityStr] ?? "") : "";

  const PALETTE = ["from-amber-900 to-amber-700", "from-violet-900 to-violet-700", "from-blue-900 to-blue-700", "from-cyan-900 to-cyan-700", "from-purple-900 to-purple-700"];
  const cardGradient = (n: string) => PALETTE[n.charCodeAt(0) % PALETTE.length];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
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

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 mb-12">
        {/* Left: image */}
        <div className="flex flex-col gap-4">
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
                  <span className="text-gray-400 text-sm w-32 shrink-0 capitalize pt-0.5">
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
      {relatedItems.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold mb-4">More {sectionName || "Items"}</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {relatedItems.slice(0, 12).map((rel) => {
              const relName = (rel.data?.name as string) ?? rel.slug;
              const relImg = (rel.data?.image_url ?? rel.data?.icon_url) as string | undefined;
              const relRarity = rel.data?.rarity;
              const relElem = lookupAttr(attrMap, "element", rel.data?.element)
                ?? Object.keys(rel.data ?? {}).map(k => lookupAttr(attrMap, k, rel.data[k])).find(Boolean) ?? null;
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
    </main>
  );
}
