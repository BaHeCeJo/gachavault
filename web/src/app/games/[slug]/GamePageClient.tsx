"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { collectionsApi, itemsApi, tierlistsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ItemFilterBar, { filterItems, type ActiveFilters } from "@/components/ItemFilterBar";
import { SafeImage } from "@/components/SafeImage";
import type { GamePageBundle } from "@/lib/seo";

type Tab = "overview" | "sections" | "tierlists" | "collection";

interface CollectionEntry {
  item_id: string;
  game_id: string;
  owned: boolean;
}

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
  game_slug?: string;
  section_id: string;
  section_slug?: string;
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

const PALETTE = ["from-amber-900 to-amber-700", "from-violet-900 to-violet-700", "from-blue-900 to-blue-700", "from-cyan-900 to-cyan-700", "from-purple-900 to-purple-700"];
function cardGradient(name: string) {
  return PALETTE[name.charCodeAt(0) % PALETTE.length];
}

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
  return <span className={`text-xs font-semibold ${colorMap[str] ?? "text-gray-400"}`}>{str}</span>;
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

interface ClientProps {
  initial: GamePageBundle;
}

export default function GamePageClient({ initial }: ClientProps) {
  const t = useTranslations("games");
  const { user } = useAuth();
  const game = initial.game as Game;
  const sections = initial.sections as Section[];
  const attrList = initial.attributes as GameAttribute[];
  const attrMap = useMemo(() => buildAttrMap(attrList), [attrList]);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [activeSection, setActiveSection] = useState<string | null>(initial.initialSectionId);
  const [items, setItems] = useState<Item[]>(initial.initialItems as Item[]);
  const [tierlists, setTierlists] = useState<TierList[]>([]);
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [search, setSearch] = useState("");

  // Collection tab — owned-set + per-game item totals, both lazy-loaded the
  // first time the user opens the tab.
  const [collectionEntries, setCollectionEntries] = useState<CollectionEntry[] | null>(null);
  const [allGameItems, setAllGameItems] = useState<Item[] | null>(null);

  useEffect(() => {
    if (!game.id) return;
    tierlistsApi
      .listPublicForGame(game.id)
      .then((r) => setTierlists(r.data.data ?? []))
      .catch(() => {});
  }, [game.id]);

  useEffect(() => {
    if (activeTab !== "collection") return;
    if (!user) return;
    if (collectionEntries === null) {
      collectionsApi
        .getByGame(game.id)
        .then((r) => setCollectionEntries(r.data.data ?? []))
        .catch(() => setCollectionEntries([]));
    }
    if (allGameItems === null) {
      itemsApi
        .listAll<Item>({ game_id: game.id })
        .then((all) => setAllGameItems(all))
        .catch(() => setAllGameItems([]));
    }
  }, [activeTab, user, game.id, collectionEntries, allGameItems]);

  // Skip the fetch on first render — the server already shipped items for
  // the initial section. Subsequent section switches do a client-side fetch.
  const skipFirstSectionFetch = useRef(true);
  useEffect(() => {
    if (!activeSection) return;
    if (skipFirstSectionFetch.current && activeSection === initial.initialSectionId) {
      skipFirstSectionFetch.current = false;
      return;
    }
    setActiveFilters({});
    setSearch("");
    itemsApi
      .listAll<Item>({ game_id: game.id, section_id: activeSection })
      .then((all) => setItems(all))
      .catch(() => setItems([]));
  }, [game.id, activeSection, initial.initialSectionId]);

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

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* Banner with gradient overlay */}
      <div className="relative w-full h-56 rounded-xl overflow-hidden mb-6">
        <SafeImage
          src={game.banner_url}
          alt={game.name}
          fill
          priority
          sizes="(min-width: 1280px) 1280px, 100vw"
          className="object-cover"
          fallback={
            <div className={`w-full h-full bg-gradient-to-br ${cardGradient(game.name)} flex items-center justify-center text-6xl font-semibold text-white/40`}>
              {game.name[0]}
            </div>
          }
        />
        {/* Bottom fade to background */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
      </div>

      <div className="flex items-center gap-4 mb-8">
        {game.logo_url && (
          <SafeImage src={game.logo_url} alt="" width={56} height={56} priority className="w-14 h-14 rounded-lg object-cover border border-gray-700" />
        )}
        <div>
          <h1 className="text-3xl font-semibold">{game.name}</h1>
          {game.description && <p className="text-gray-400 mt-1">{game.description}</p>}
        </div>
      </div>

      {/* Top-level tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-800 overflow-x-auto -mx-1 px-1">
        {(["overview", "sections", "tierlists", "collection"] as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm whitespace-nowrap border-b-2 transition ${
              activeTab === tab
                ? "border-amber-400 text-white"
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            {t(`tabs.${tab}`)}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <OverviewTab
          sections={sections}
          itemCountsBySection={initial.itemCountsBySection}
          tierlists={tierlists}
          onJumpToSection={(id) => {
            setActiveSection(id);
            setActiveTab("sections");
          }}
          onJumpToTierLists={() => setActiveTab("tierlists")}
          tNoTierlists={t("overview.noTierlists")}
          tSectionsTitle={t("overview.sectionsTitle")}
          tTierlistsTitle={t("overview.tierlistsTitle")}
          tViewAll={t("overview.viewAll")}
        />
      )}

      {activeTab === "sections" && (
        <>
          {/* Section sub-tabs */}
          {sections.length > 0 && (
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`px-4 py-2 rounded-lg text-sm whitespace-nowrap transition ${
                    activeSection === s.id
                      ? "bg-amber-500 text-black shadow-sm shadow-amber-500/20"
                      : "border border-gray-700 text-gray-300 hover:border-amber-500/60 hover:text-amber-300"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

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

          {items.length === 0 ? (
            <p className="text-gray-400 mb-12">{t("noItems")}</p>
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
                const rarityStr = typeof rarity === "number" ? undefined : String(rarity ?? "");
                const badgeAttrs = Object.keys(item.data ?? {})
                  .filter(k => k !== "element" && attrMap[k] && typeof item.data[k] === "string")
                  .slice(0, 1)
                  .map(k => lookupAttr(attrMap, k, item.data[k]))
                  .filter(Boolean) as GameAttribute[];

                return (
                  <Link
                    key={item.id}
                    href={item.game_slug && item.section_slug ? `/games/${item.game_slug}/${item.section_slug}/${item.slug}` : `/games/${game.slug}/items/${item.id}`}
                    className={`flex flex-col rounded-lg border bg-gray-900 overflow-hidden transition-all duration-200 group hover:scale-[1.03] hover:shadow-lg ${
                      rarityStr && RARITY_BORDER[rarityStr]
                        ? `${RARITY_BORDER[rarityStr]} hover:shadow-lg ${RARITY_GLOW[rarityStr]}`
                        : "border-gray-800 hover:border-amber-500/60 hover:shadow-amber-500/10"
                    }`}
                  >
                    <div className="relative h-28 w-full">
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
                      {(elementAttr || badgeAttrs[0]) && (
                        <div className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
                          <AttrBadge attr={(elementAttr ?? badgeAttrs[0])!} />
                        </div>
                      )}
                      {rarity !== undefined && (
                        <div className="absolute bottom-1 left-1.5">
                          <RarityBadge value={rarity} />
                        </div>
                      )}
                    </div>
                    <p className="px-2 py-1.5 text-xs truncate">{name}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === "tierlists" && (
        <TierListsTab tierlists={tierlists} />
      )}

      {activeTab === "collection" && (
        <CollectionTab
          isLoggedIn={!!user}
          entries={collectionEntries}
          allItems={allGameItems}
          sections={sections}
          gameSlug={game.slug}
          tSignInCTA={t("collection.signInCTA")}
          tSignInDesc={t("collection.signInDesc")}
          tEmpty={t("collection.empty")}
        />
      )}
    </main>
  );
}

function OverviewTab({
  sections, itemCountsBySection, tierlists, onJumpToSection, onJumpToTierLists,
  tNoTierlists, tSectionsTitle, tTierlistsTitle, tViewAll,
}: {
  sections: Section[];
  itemCountsBySection: Record<string, number>;
  tierlists: TierList[];
  onJumpToSection: (id: string) => void;
  onJumpToTierLists: () => void;
  tNoTierlists: string;
  tSectionsTitle: string;
  tTierlistsTitle: string;
  tViewAll: string;
}) {
  const topTierlists = tierlists.slice(0, 3);
  return (
    <div className="space-y-10">
      {sections.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3">{tSectionsTitle}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onJumpToSection(s.id)}
                className="text-left p-4 rounded-xl border border-gray-800 hover:border-amber-500/50 hover:bg-gray-900/60 transition group"
              >
                <p className="font-semibold group-hover:text-amber-300 transition">{s.name}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {itemCountsBySection[s.id] ?? 0} items
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{tTierlistsTitle}</h2>
          {tierlists.length > 3 && (
            <button
              type="button"
              onClick={onJumpToTierLists}
              className="text-sm text-gray-400 hover:text-amber-300 transition"
            >
              {tViewAll} →
            </button>
          )}
        </div>
        {topTierlists.length === 0 ? (
          <p className="text-gray-500 text-sm">{tNoTierlists}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {topTierlists.map((tl) => (
              <Link
                key={tl.id}
                href={`/tierlists/share/${tl.share_slug}`}
                className="p-4 rounded-xl border border-gray-800 hover:border-amber-500/50 transition"
              >
                <p className="truncate">{tl.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs text-gray-400">
                    Updated {new Date(tl.updated_at).toLocaleDateString()}
                  </p>
                  {tl.upvote_count > 0 && (
                    <span className="text-xs text-amber-400">△ {tl.upvote_count}</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TierListsTab({ tierlists }: { tierlists: TierList[] }) {
  if (tierlists.length === 0) {
    return (
      <div className="rounded-xl border border-gray-800 p-6 text-center">
        <p className="text-gray-400 mb-4">No community tier lists for this game yet.</p>
        <Link
          href="/tierlists"
          className="inline-block px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 transition"
        >
          Create the first one
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
      {tierlists.map((tl) => (
        <Link
          key={tl.id}
          href={`/tierlists/share/${tl.share_slug}`}
          className="p-4 rounded-xl border border-gray-800 hover:border-amber-500/50 hover:shadow-md hover:shadow-amber-500/10 transition-all duration-200"
        >
          <p className="truncate">{tl.title}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-gray-400">
              Updated {new Date(tl.updated_at).toLocaleDateString()}
            </p>
            {tl.upvote_count > 0 && (
              <span className="text-xs text-amber-400">△ {tl.upvote_count}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

function CollectionTab({
  isLoggedIn, entries, allItems, sections, gameSlug,
  tSignInCTA, tSignInDesc, tEmpty,
}: {
  isLoggedIn: boolean;
  entries: CollectionEntry[] | null;
  allItems: Item[] | null;
  sections: Section[];
  gameSlug: string;
  tSignInCTA: string;
  tSignInDesc: string;
  tEmpty: string;
}) {
  if (!isLoggedIn) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 sm:p-8 text-center">
        <h2 className="text-xl font-semibold mb-2">{tSignInCTA}</h2>
        <p className="text-sm text-gray-300 max-w-md mx-auto mb-5">{tSignInDesc}</p>
        <div className="flex gap-3 justify-center">
          <Link
            href={`/auth/register?redirect=/games/${gameSlug}`}
            className="px-5 py-2.5 bg-amber-500 text-black rounded-lg text-sm font-semibold hover:bg-amber-400 transition"
          >
            Create account
          </Link>
          <Link
            href={`/auth/login?redirect=/games/${gameSlug}`}
            className="px-5 py-2.5 border border-gray-700 rounded-lg text-sm hover:border-amber-400 hover:text-amber-300 transition"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (entries === null || allItems === null) {
    return (
      <div className="space-y-2">
        <div className="h-20 rounded-xl bg-gray-800 animate-pulse" />
        <div className="h-20 rounded-xl bg-gray-800 animate-pulse" />
      </div>
    );
  }

  const ownedIds = new Set(entries.filter((e) => e.owned).map((e) => e.item_id));
  const total = allItems.length;
  const owned = ownedIds.size;

  if (total === 0) {
    return <p className="text-gray-400">{tEmpty}</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="flex items-baseline justify-between mb-3">
          <p className="text-2xl font-semibold">
            {owned} <span className="text-gray-500 text-base">/ {total}</span>
          </p>
          <Link
            href="/collections"
            className="text-sm text-amber-400 hover:text-amber-300 transition"
          >
            Manage →
          </Link>
        </div>
        <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
          <div
            className="h-full bg-amber-500"
            style={{ width: `${total > 0 ? Math.round((owned / total) * 100) : 0}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sections.map((s) => {
          const sectionItems = allItems.filter((it) => it.section_id === s.id);
          const sectionOwned = sectionItems.filter((it) => ownedIds.has(it.id)).length;
          if (sectionItems.length === 0) return null;
          return (
            <div
              key={s.id}
              className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-4"
            >
              <div className="flex items-baseline justify-between">
                <p>{s.name}</p>
                <p className="text-sm text-gray-400">
                  {sectionOwned} / {sectionItems.length}
                </p>
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 mt-2 overflow-hidden">
                <div
                  className="h-full bg-amber-500/70"
                  style={{ width: `${sectionItems.length > 0 ? Math.round((sectionOwned / sectionItems.length) * 100) : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
