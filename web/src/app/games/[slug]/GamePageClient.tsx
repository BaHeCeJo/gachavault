"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { collectionsApi, eventsApi, itemsApi, tierlistsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ItemFilterBar, { filterItems, type ActiveFilters } from "@/components/ItemFilterBar";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient } from "@/lib/theme";
import ItemCard, { type CardLayout } from "@/components/ItemCard";
import { cardIsPortrait } from "@/lib/imageSlots";
import { CalendarView } from "@/components/CalendarView";
import { BannerShowcase } from "@/components/BannerShowcase";
import { type AttrMap, type GameAttribute, type SchemaFieldLite, buildAttrMap } from "@/lib/attrs";
import { BANNER_SECTION_SLUG, type CalendarEvent } from "@/lib/events";
import type { GamePageBundle } from "@/lib/seo";

type Tab = "overview" | "sections" | "calendar" | "tierlists" | "collection";

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
  type_schema_id?: string | null;
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

interface Schema {
  id: string;
  section_id: string | null;
  fields: SchemaFieldLite[];
  filter_attrs: string[] | null;
  card_layout: CardLayout | null;
  is_collectable?: boolean;
  image_slots?: unknown;
}

// Picks the schema that governs how an item card renders. Prefer the item's
// own type_schema_id; fall back to any schema bound to the section, then to
// a game-wide schema.
function schemaForItem(schemas: Schema[], item: Item): Schema | null {
  if (item.type_schema_id) {
    const direct = schemas.find((s) => s.id === item.type_schema_id);
    if (direct) return direct;
  }
  return (
    schemas.find((s) => s.section_id === item.section_id) ??
    schemas.find((s) => s.section_id === null) ??
    null
  );
}

interface ClientProps {
  initial: GamePageBundle;
}

export default function GamePageClient({ initial }: ClientProps) {
  const t = useTranslations("games");
  const locale = useLocale();
  const { user } = useAuth();
  const game = initial.game as Game;
  // Sections with nothing in them are hidden rather than shown as an empty
  // tab/card: every game now ships a Banners section whether or not it has
  // banners yet, and a "Banners · 0 items" card is noise until it does. The
  // admin UI still lists every section, empty or not.
  const sections = useMemo(
    () =>
      (initial.sections as Section[]).filter(
        (s) => (initial.itemCountsBySection[s.id] ?? 0) > 0,
      ),
    [initial.sections, initial.itemCountsBySection],
  );
  const attrList = initial.attributes as GameAttribute[];
  const schemas = (initial.schemas ?? []) as Schema[];
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

  // Calendar tab — current + upcoming events for this game, lazy-loaded the
  // first time the tab opens.
  const [events, setEvents] = useState<CalendarEvent[] | null>(null);

  useEffect(() => {
    if (!game.id) return;
    tierlistsApi
      .listPublicForGame(game.id)
      .then((r) => setTierlists(r.data.data ?? []))
      .catch(() => {});
  }, [game.id]);

  // Two parallel one-shot fetches when the collection tab first opens.
  // Kept as separate effects so each only re-runs when its own state changes;
  // bundling them shared deps array, which re-ran the whole thing every time
  // either fetch settled and risked refetching the just-loaded list.
  useEffect(() => {
    if (activeTab !== "collection" || !user || collectionEntries !== null) return;
    collectionsApi
      .getByGame(game.id)
      .then((r) => setCollectionEntries(r.data.data ?? []))
      .catch(() => setCollectionEntries([]));
  }, [activeTab, user, game.id, collectionEntries]);

  useEffect(() => {
    if (activeTab !== "collection" || !user || allGameItems !== null) return;
    itemsApi
      .listAll<Item>({ game_id: game.id })
      .then((all) => setAllGameItems(all))
      .catch(() => setAllGameItems([]));
  }, [activeTab, user, game.id, allGameItems]);

  // Owning an item is a one-click, high-volume action — a catalogue is built
  // by clicking through dozens in a row — so the card flips immediately and
  // the write happens behind it. On failure we put the card back rather than
  // leaving it claiming something the server didn't record.
  const toggleOwned = async (itemId: string, next: boolean) => {
    setCollectionEntries((prev) => {
      const list = prev ?? [];
      return list.some((e) => e.item_id === itemId)
        ? list.map((e) => (e.item_id === itemId ? { ...e, owned: next } : e))
        : [...list, { item_id: itemId, game_id: game.id, owned: next }];
    });
    try {
      if (next) {
        await collectionsApi.upsertEntry(itemId, { game_id: game.id, owned: true });
      } else {
        await collectionsApi.deleteEntry(itemId);
      }
    } catch {
      setCollectionEntries((prev) =>
        (prev ?? []).map((e) => (e.item_id === itemId ? { ...e, owned: !next } : e)),
      );
    }
  };

  useEffect(() => {
    if (activeTab !== "calendar" || events !== null) return;
    eventsApi
      .list({ game: game.slug, from: new Date().toISOString(), locale })
      .then((r) => setEvents(r.data.data ?? []))
      .catch(() => setEvents([]));
  }, [activeTab, game.slug, events, locale]);

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

  // The banners section renders as a schedule showcase rather than an item
  // grid. It gets its own fetch rather than reusing the calendar tab's: this
  // one is every run ever (a game's banners are mostly history), where the
  // calendar deliberately starts at today.
  const isBannerSection = useMemo(
    () => sections.find((s) => s.id === activeSection)?.slug === BANNER_SECTION_SLUG,
    [sections, activeSection],
  );
  const [bannerRuns, setBannerRuns] = useState<CalendarEvent[] | null>(null);
  useEffect(() => {
    if (!isBannerSection || bannerRuns !== null) return;
    eventsApi
      .list({ game: game.slug, event_type: "banner", locale })
      .then((r) => setBannerRuns(r.data.data ?? []))
      .catch(() => setBannerRuns([]));
  }, [isBannerSection, bannerRuns, game.slug, locale]);

  const visibleItems = useMemo(
    () => filterItems(items, activeFilters, search),
    [items, activeFilters, search],
  );

  // The active section's schema drives both the filter chips and the per-
  // item card layout. Prefer a schema explicitly bound to the section,
  // falling back to a game-wide schema (section_id=null). One schema per
  // section is enforced in the DB, so this is a single resolution.
  const sectionSchema = useMemo<Schema | null>(() => {
    if (!activeSection) return null;
    return (
      schemas.find((s) => s.section_id === activeSection) ??
      schemas.find((s) => s.section_id === null) ??
      null
    );
  }, [activeSection, schemas]);

  // null = auto (the existing has-values heuristic decides). Otherwise an
  // allowlist of schema field keys to render as filter chip groups.
  const filterAllowlist: string[] | null = sectionSchema?.filter_attrs ?? null;

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
        {(["overview", "sections", "calendar", "tierlists", "collection"] as Tab[]).map((tab) => (
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
          previewItems={(initial.initialItems as Item[]).slice(0, 12)}
          previewSection={sections.find((s) => s.id === initial.initialSectionId) ?? null}
          attrMap={attrMap}
          schemas={schemas}
          gameSlug={game.slug}
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

          {/* Banners are runs on a schedule, not catalogue entries: a grid of
              identical cards says nothing about what's live. Render the same
              showcase /banners uses, scoped to this game. */}
          {isBannerSection ? (
            <div className="mb-12">
              <BannerShowcase
                events={bannerRuns ?? []}
                showGame={false}
                isLoading={bannerRuns === null}
              />
            </div>
          ) : (
          <>
          {items.length > 0 && (
            <ItemFilterBar
              attributes={attrList}
              items={items}
              activeFilters={activeFilters}
              search={search}
              schemaFields={sectionSchema?.fields}
              allowedKeys={filterAllowlist}
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
                const sch = schemaForItem(schemas, item);
                return (
                  <ItemCard
                    key={item.id}
                    item={item}
                    attrMap={attrMap}
                    layout={sch?.card_layout ?? null}
                    schemaFields={sch?.fields}
                    fallbackGameSlug={game.slug}
                    portrait={cardIsPortrait(sch)}
                  />
                );
              })}
            </div>
          )}
          </>
          )}
        </>
      )}

      {activeTab === "calendar" && (
        <CalendarView events={events ?? []} showGame={false} isLoading={events === null} />
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
          attrMap={attrMap}
          schemas={schemas}
          onToggleOwned={toggleOwned}
          tSignInCTA={t("collection.signInCTA")}
          tSignInDesc={t("collection.signInDesc")}
          tEmpty={t("collection.empty")}
        />
      )}
    </main>
  );
}

function OverviewTab({
  sections, itemCountsBySection, previewItems, previewSection, attrMap, schemas, gameSlug,
  tierlists, onJumpToSection, onJumpToTierLists,
  tNoTierlists, tSectionsTitle, tTierlistsTitle, tViewAll,
}: {
  sections: Section[];
  itemCountsBySection: Record<string, number>;
  previewItems: Item[];
  previewSection: Section | null;
  attrMap: AttrMap;
  schemas: Schema[];
  gameSlug: string;
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

      {previewItems.length > 0 && previewSection && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{previewSection.name}</h2>
            <button
              type="button"
              onClick={() => onJumpToSection(previewSection.id)}
              className="text-sm text-gray-400 hover:text-amber-300 transition"
            >
              {tViewAll} →
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {previewItems.map((item) => {
              const sch = schemaForItem(schemas, item);
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  attrMap={attrMap}
                  layout={sch?.card_layout ?? null}
                  schemaFields={sch?.fields}
                  fallbackGameSlug={gameSlug}
                  portrait={cardIsPortrait(sch)}
                />
              );
            })}
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
  isLoggedIn, entries, allItems, sections, gameSlug, attrMap, schemas, onToggleOwned,
  tSignInCTA, tSignInDesc, tEmpty,
}: {
  isLoggedIn: boolean;
  entries: CollectionEntry[] | null;
  allItems: Item[] | null;
  sections: Section[];
  gameSlug: string;
  attrMap: AttrMap;
  schemas: Schema[];
  onToggleOwned: (itemId: string, next: boolean) => void;
  tSignInCTA: string;
  tSignInDesc: string;
  tEmpty: string;
}) {
  // One section open at a time. A game can hold hundreds of items across
  // sections, and mounting every card at once to tick three boxes is the
  // wrong trade — the summary rows stay the overview, a section opens into
  // the grid you actually click through.
  const [openSection, setOpenSection] = useState<string | null>(null);
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

      <div className="space-y-3">
        {sections.map((s) => {
          const sectionItems = allItems.filter((it) => it.section_id === s.id);
          const sectionOwned = sectionItems.filter((it) => ownedIds.has(it.id)).length;
          if (sectionItems.length === 0) return null;
          const isOpen = openSection === s.id;
          return (
            <div key={s.id} className="rounded-xl border border-gray-800 bg-gray-900">
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : s.id)}
                aria-expanded={isOpen}
                className="w-full px-5 py-4 text-left hover:bg-gray-800/40 transition rounded-xl"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex items-center gap-2">
                    <span
                      className={`text-gray-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
                      aria-hidden
                    >
                      ›
                    </span>
                    {s.name}
                  </p>
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
              </button>

              {isOpen && (
                <div className="border-t border-gray-800 p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {sectionItems.map((item) => {
                      const sch = schemaForItem(schemas, item);
                      const owned = ownedIds.has(item.id);
                      return (
                        <ItemCard
                          key={item.id}
                          item={item}
                          attrMap={attrMap}
                          layout={sch?.card_layout ?? null}
                          schemaFields={sch?.fields}
                          fallbackGameSlug={gameSlug}
                          portrait={cardIsPortrait(sch)}
                          // The image still links through to the item; the
                          // footer is the toggle, so a mis-aimed click browses
                          // rather than silently editing the collection.
                          linkMode="image"
                          footer={
                            <button
                              type="button"
                              onClick={() => onToggleOwned(item.id, !owned)}
                              aria-pressed={owned}
                              className={`mt-1 w-full rounded-md px-2 py-1 text-xs font-medium transition ${
                                owned
                                  ? "bg-amber-500 text-black hover:bg-amber-400"
                                  : "border border-gray-700 text-gray-400 hover:border-amber-400 hover:text-amber-300"
                              }`}
                            >
                              {owned ? "✓ Owned" : "+ Own"}
                            </button>
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
