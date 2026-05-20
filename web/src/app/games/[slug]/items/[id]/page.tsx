"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { gamesApi, itemsApi } from "@/lib/api";
import { getClientLocale } from "@/lib/locale";
import { SafeImage } from "@/components/SafeImage";

interface Item {
  id: string;
  slug: string;
  game_id: string;
  section_id: string;
  type_schema_id: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface SchemaField {
  key: string;
  label: string;
  type: string;
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
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
    <span className={`px-3 py-0.5 rounded-full text-sm font-bold border ${colorMap[str] ?? "text-gray-400 border-gray-700 bg-gray-800"}`}>
      {str}
    </span>
  );
}

function FieldValue({ fieldKey, value, attrMap }: { fieldKey: string; value: unknown; attrMap: AttrMap }) {
  if (value === null || value === undefined || value === "") return <span className="text-gray-600">—</span>;

  // Check if this field has an attribute match
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

export default function ItemDetailPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [attrMap, setAttrMap] = useState<AttrMap>({});
  const [gameName, setGameName] = useState(slug);
  const [sectionName, setSectionName] = useState("");
  const [relatedItems, setRelatedItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const locale = getClientLocale();
    Promise.all([
      itemsApi.get(id, locale),
      gamesApi.get(slug, locale),
      gamesApi.getAttributes(slug),
      gamesApi.listSchemas(slug),
      gamesApi.getSections(slug),
    ])
      .then(([itemRes, gameRes, attrsRes, schemasRes, sectionsRes]) => {
        const it: Item = itemRes.data.data;
        setItem(it);
        setGameName(gameRes.data.data.name);

        const attrs: GameAttribute[] = attrsRes.data.data ?? [];
        setAttrMap(buildAttrMap(attrs));

        const schemas = schemasRes.data.data ?? [];
        const schema = schemas.find((s: { id: string; fields: SchemaField[] }) => s.id === it.type_schema_id);
        if (schema?.fields) setFields(schema.fields);

        const sections = sectionsRes.data.data ?? [];
        const section = sections.find((s: { id: string; name: string }) => s.id === it.section_id);
        if (section) setSectionName(section.name);

        // Load related items
        return itemsApi.list({ game_id: it.game_id, section_id: it.section_id, limit: 12, offset: 0 });
      })
      .then((relRes) => {
        if (relRes?.data?.data) {
          setRelatedItems((relRes.data.data as Item[]).filter((r: Item) => r.id !== id));
        }
      })
      .catch(() => setError("Failed to load item"))
      .finally(() => setLoading(false));
  }, [slug, id]);

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="h-64 rounded-xl bg-gray-800 animate-pulse mb-6" />
      </main>
    );
  }

  if (error || !item) {
    return (
      <main className="max-w-5xl mx-auto px-6 py-10">
        <p className="text-red-400">{error || "Item not found"}</p>
        <Link href={`/games/${slug}`} className="text-sm text-gray-400 hover:text-white mt-4 inline-block">
          ← Back to {gameName}
        </Link>
      </main>
    );
  }

  const name = (item.data?.name as string) ?? item.slug;
  const imageUrl = item.data?.image_url as string | undefined;
  const iconUrl = item.data?.icon_url as string | undefined;

  // Build ordered list of fields to show
  const orderedFields: { key: string; label: string }[] = fields.length > 0
    ? fields.filter(f => !HIDDEN_IN_DETAILS.has(f.key)).map(f => ({ key: f.key, label: f.label }))
    : Object.keys(item.data).filter(k => !HIDDEN_IN_DETAILS.has(k)).map(k => ({ key: k, label: k.replace(/_/g, " ") }));

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-sm text-gray-400 flex-wrap">
        <Link href="/games" className="hover:text-white">Games</Link>
        <span>/</span>
        <Link href={`/games/${slug}`} className="hover:text-white">{gameName}</Link>
        {sectionName && (
          <>
            <span>/</span>
            <span className="text-gray-500">{sectionName}</span>
          </>
        )}
        <span>/</span>
        <span className="text-white">{name}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-8 mb-12">
        {/* Left: image */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-900">
            {imageUrl ? (
              <SafeImage src={imageUrl} alt={name} width={400} height={400} className="w-full object-cover" fallback={
                <div className="h-64 flex items-center justify-center text-6xl font-bold text-gray-600">
                  {name[0]?.toUpperCase()}
                </div>
              } />
            ) : iconUrl ? (
              <SafeImage src={iconUrl} alt={name} width={400} height={400} className="w-full object-contain p-6" fallback={
                <div className="h-64 flex items-center justify-center text-6xl font-bold text-gray-600">
                  {name[0]?.toUpperCase()}
                </div>
              } />
            ) : (
              <div className="h-64 flex items-center justify-center text-6xl font-bold text-gray-600">
                {name[0]?.toUpperCase()}
              </div>
            )}
          </div>
          {iconUrl && imageUrl && (
            <SafeImage src={iconUrl} alt={`${name} icon`} width={64} height={64} className="w-16 h-16 rounded-lg border border-gray-800 object-contain self-start" />
          )}
        </div>

        {/* Right: details */}
        <div>
          <h1 className="text-3xl font-bold mb-1">{name}</h1>
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            {sectionName && (
              <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">{sectionName}</span>
            )}
            {item.data?.rarity !== undefined && <RarityStars value={item.data.rarity} />}
          </div>

          {/* Description — full width if present */}
          {typeof item.data?.description === "string" && item.data.description && (
            <p className="text-gray-300 text-sm leading-relaxed mb-6 border-l-2 border-gray-700 pl-4">
              {item.data.description}
            </p>
          )}

          {/* Stats table */}
          <div className="space-y-0 rounded-xl border border-gray-800 overflow-hidden">
            {orderedFields.filter(f => f.key !== "description").map(({ key, label }, i) => {
              const value = item.data[key];
              if (value === undefined || value === null || value === "") return null;
              return (
                <div
                  key={key}
                  className={`flex items-start gap-4 px-4 py-3 ${i % 2 === 0 ? "bg-gray-900/60" : "bg-gray-900/30"}`}
                >
                  <span className="text-gray-500 text-sm w-32 shrink-0 capitalize pt-0.5">
                    {label}
                  </span>
                  <div className="flex-1">
                    <FieldValue fieldKey={key} value={value} attrMap={attrMap} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Related items */}
      {relatedItems.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4">More {sectionName || "Items"}</h2>
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
                  href={`/games/${slug}/items/${rel.id}`}
                  className="flex flex-col rounded-lg border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-600 transition group"
                >
                  <div className="relative h-20">
                    <SafeImage src={relImg} alt={relName} fill className="object-cover group-hover:scale-105 transition-transform duration-200" fallback={
                      <div className="h-full bg-gray-800 flex items-center justify-center text-xl font-bold text-gray-600">
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
                          : <span className="text-yellow-400 text-xs font-bold">{String(relRarity)}</span>
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
