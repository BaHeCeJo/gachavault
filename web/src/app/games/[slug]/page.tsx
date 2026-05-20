"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { gamesApi, itemsApi, tierlistsApi } from "@/lib/api";
import { getClientLocale } from "@/lib/locale";
import ItemFilterBar, { filterItems, type ActiveFilters } from "@/components/ItemFilterBar";
import { SafeImage } from "@/components/SafeImage";

interface Game {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
}

interface Section {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
}

interface Item {
  id: string;
  slug: string;
  data: Record<string, unknown>;
}

interface TierList {
  id: string;
  title: string;
  share_slug: string;
  user_id: string;
  upvote_count: number;
  updated_at: string;
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
  const colorMap: Record<string, string> = { SSR: "text-yellow-400", SR: "text-purple-400", R: "text-blue-400", S: "text-yellow-400" };
  return <span className={`text-xs font-bold ${colorMap[str] ?? "text-gray-400"}`}>{str}</span>;
}

function AttrBadge({ attr }: { attr: GameAttribute }) {
  if (attr.icon_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={attr.icon_url} alt={attr.name} title={attr.name} className="w-5 h-5 object-contain" />;
  }
  return (
    <span
      title={attr.name}
      className="w-4 h-4 rounded-full inline-block border border-black/20"
      style={{ backgroundColor: attr.color ?? "#888" }}
    />
  );
}

export default function GameDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [game, setGame] = useState<Game | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [tierlists, setTierlists] = useState<TierList[]>([]);
  const [attrMap, setAttrMap] = useState<AttrMap>({});
  const [attrList, setAttrList] = useState<GameAttribute[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const locale = getClientLocale();
    Promise.all([gamesApi.get(slug, locale), gamesApi.getSections(slug), gamesApi.getAttributes(slug)])
      .then(([gameRes, sectionsRes, attrsRes]) => {
        const g: Game = gameRes.data.data;
        setGame(g);
        const secs: Section[] = sectionsRes.data.data ?? [];
        setSections(secs);
        if (secs.length > 0) setActiveSection(secs[0].id);
        const attrs: GameAttribute[] = attrsRes.data.data ?? [];
        setAttrList(attrs);
        setAttrMap(buildAttrMap(attrs));
        tierlistsApi.listPublicForGame(g.id)
          .then((r) => setTierlists(r.data.data ?? []))
          .catch(() => {});
      })
      .catch(() => setError("Failed to load game"))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!game || !activeSection) return;
    setActiveFilters({});
    setSearch("");
    itemsApi
      .list({ game_id: game.id, section_id: activeSection, limit: 200, offset: 0 })
      .then((res) => setItems(res.data.data ?? []))
      .catch(() => setItems([]));
  }, [game, activeSection]);

  const visibleItems = useMemo(
    () => filterItems(items, activeFilters, search),
    [items, activeFilters, search],
  );

  function toggleFilter(attrType: string, key: string) {
    setActiveFilters(prev => {
      const next = { ...prev };
      const cur = new Set(next[attrType] ?? []);
      if (cur.has(key)) cur.delete(key); else cur.add(key);
      next[attrType] = cur;
      return next;
    });
  }

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="h-48 rounded-xl bg-gray-800 animate-pulse mb-6" />
        <div className="h-8 w-48 bg-gray-800 animate-pulse rounded" />
      </main>
    );
  }

  if (error || !game) {
    return (
      <main className="max-w-7xl mx-auto px-6 py-10">
        <p className="text-red-400">{error || "Game not found"}</p>
        <Link href="/games" className="text-sm text-gray-400 hover:text-white mt-4 inline-block">
          ← Back to games
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* Banner */}
      <div className="relative w-full h-48 rounded-xl overflow-hidden mb-6">
        <SafeImage
          src={game.banner_url}
          alt={game.name}
          fill
          className="object-cover"
          fallback={
            <div className="w-full h-48 bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-6xl font-bold text-gray-600">
              {game.name[0]}
            </div>
          }
        />
      </div>

      <div className="flex items-center gap-4 mb-8">
        {game.logo_url && (
          <SafeImage src={game.logo_url} alt="" width={56} height={56} className="w-14 h-14 rounded-lg object-cover" />
        )}
        <div>
          <h1 className="text-3xl font-bold">{game.name}</h1>
          {game.description && <p className="text-gray-400 mt-1">{game.description}</p>}
        </div>
      </div>

      {/* Section tabs */}
      {sections.length > 0 && (
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                activeSection === s.id
                  ? "bg-white text-black"
                  : "border border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Filter bar */}
      {items.length > 0 && (
        <ItemFilterBar
          attributes={attrList}
          items={items}
          activeFilters={activeFilters}
          search={search}
          onFilterToggle={toggleFilter}
          onClearAll={() => { setActiveFilters({}); setSearch(""); }}
          onSearchChange={setSearch}
        />
      )}

      {/* Items grid */}
      {items.length === 0 ? (
        <p className="text-gray-400 mb-12">No items in this section yet.</p>
      ) : visibleItems.length === 0 ? (
        <p className="text-gray-400 mb-12">No items match the current filters.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-12">
          {visibleItems.map((item) => {
            const name = (item.data?.name as string) ?? item.slug;
            const imageUrl = (item.data?.image_url ?? item.data?.icon_url) as string | undefined;
            const elementAttr = lookupAttr(attrMap, "element", item.data?.element)
              ?? lookupAttr(attrMap, "attribute", item.data?.element);
            const rarity = item.data?.rarity;
            // find any attr_type that matches a field key
            const badgeAttrs = Object.keys(item.data ?? {})
              .filter(k => k !== "element" && attrMap[k] && typeof item.data[k] === "string")
              .slice(0, 1)
              .map(k => lookupAttr(attrMap, k, item.data[k]))
              .filter(Boolean) as GameAttribute[];

            return (
              <Link
                key={item.id}
                href={`/games/${slug}/items/${item.id}`}
                className="flex flex-col rounded-lg border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-600 transition group"
              >
                <div className="relative h-28 w-full">
                  <SafeImage
                    src={imageUrl}
                    alt={name}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-200"
                    fallback={
                      <div className="h-full w-full bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-2xl font-bold text-gray-500">
                        {name[0]?.toUpperCase()}
                      </div>
                    }
                  />
                  {/* Element / primary attribute badge — top right */}
                  {(elementAttr || badgeAttrs[0]) && (
                    <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                      <AttrBadge attr={(elementAttr ?? badgeAttrs[0])!} />
                    </div>
                  )}
                  {/* Rarity — bottom left */}
                  {rarity !== undefined && (
                    <div className="absolute bottom-1 left-1.5">
                      <RarityBadge value={rarity} />
                    </div>
                  )}
                </div>
                <p className="px-2 py-1.5 text-xs font-medium truncate">{name}</p>
              </Link>
            );
          })}
        </div>
      )}

      {/* Community Tier Lists */}
      {tierlists.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Community Tier Lists</h2>
            <Link href="/tierlists" className="text-sm text-gray-400 hover:text-white">
              Create yours →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {tierlists.slice(0, 6).map((tl) => (
              <Link
                key={tl.id}
                href={`/tierlists/share/${tl.share_slug}`}
                className="p-4 rounded-xl border border-gray-800 hover:border-gray-600 transition"
              >
                <p className="font-medium truncate">{tl.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-500">
                    Updated {new Date(tl.updated_at).toLocaleDateString()}
                  </p>
                  {tl.upvote_count > 0 && (
                    <span className="text-xs text-gray-500">△ {tl.upvote_count}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
