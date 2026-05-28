"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { collectionsApi, gamesApi, itemsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import ItemCard, { type CardLayout } from "@/components/ItemCard";
import { buildAttrMap, type GameAttribute } from "@/lib/attrs";

interface Game { id: string; slug: string; name: string }
interface CollectionEntry {
  id: string;
  item_id: string;
  game_id: string;
  owned: boolean;
  level: number | null;
  ascension: number | null;
  constellation_level: number | null;
}
interface Item {
  id: string;
  slug: string;
  section_id: string;
  type_schema_id?: string | null;
  game_slug?: string;
  section_slug?: string;
  data: Record<string, unknown>;
}
interface Section { id: string; slug: string; name: string }
interface Schema {
  id: string;
  section_id: string | null;
  card_layout: CardLayout | null;
}

export default function CollectionsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [games, setGames] = useState<Game[]>([]);
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [entries, setEntries] = useState<CollectionEntry[]>([]);
  const [items, setItems] = useState<Map<string, Item>>(new Map());
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [attrs, setAttrs] = useState<GameAttribute[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [editing, setEditing] = useState<CollectionEntry | null>(null);
  const [editForm, setEditForm] = useState({ level: "", ascension: "", constellation_level: "" });

  const attrMap = useMemo(() => buildAttrMap(attrs), [attrs]);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/auth/login?redirect=/collections");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    gamesApi.list().then((r) => setGames(r.data.data ?? [])).catch(() => {});
  }, [user]);

  const loadGame = async (game: Game) => {
    setSelectedGame(game);
    setLoadingEntries(true);
    try {
      const [entriesRes, itemsData, sectionsRes, schemasRes, attrsRes] = await Promise.all([
        collectionsApi.getByGame(game.id),
        itemsApi.listAll<Item>({ game_id: game.id }),
        gamesApi.getSections(game.slug),
        gamesApi.listSchemas(game.slug),
        gamesApi.getAttributes(game.slug),
      ]);
      const entriesData: CollectionEntry[] = entriesRes.data.data ?? [];
      setEntries(entriesData);
      setItems(new Map(itemsData.map((i) => [i.id, i])));
      setSections(sectionsRes.data.data ?? []);
      setSchemas(schemasRes.data.data ?? []);
      setAttrs(attrsRes.data.data ?? []);
    } finally {
      setLoadingEntries(false);
    }
  };

  const openEdit = (entry: CollectionEntry) => {
    setEditing(entry);
    setEditForm({
      level: entry.level?.toString() ?? "",
      ascension: entry.ascension?.toString() ?? "",
      constellation_level: entry.constellation_level?.toString() ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    await collectionsApi.upsertEntry(editing.item_id, {
      game_id: editing.game_id,
      owned: true,
      level: editForm.level ? parseInt(editForm.level) : null,
      ascension: editForm.ascension ? parseInt(editForm.ascension) : null,
      constellation_level: editForm.constellation_level ? parseInt(editForm.constellation_level) : null,
    });
    setEntries((prev) =>
      prev.map((e) =>
        e.item_id === editing.item_id
          ? {
              ...e,
              level: editForm.level ? parseInt(editForm.level) : null,
              ascension: editForm.ascension ? parseInt(editForm.ascension) : null,
              constellation_level: editForm.constellation_level ? parseInt(editForm.constellation_level) : null,
            }
          : e
      )
    );
    setEditing(null);
  };

  const removeEntry = async (itemId: string) => {
    await collectionsApi.deleteEntry(itemId);
    setEntries((prev) => prev.filter((e) => e.item_id !== itemId));
  };

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-semibold mb-2">My Collection</h1>
      <p className="text-gray-400 text-sm mb-8">Track which items you own and their progression.</p>

      {/* Game selector */}
      <div className="flex flex-wrap gap-2 mb-8">
        {games.map((g) => (
          <button
            key={g.id}
            onClick={() => loadGame(g)}
            className={`px-4 py-2 rounded-lg text-sm transition ${
              selectedGame?.id === g.id
                ? "bg-white text-black"
                : "border border-gray-700 hover:border-gray-500"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>

      {!selectedGame && (
        <p className="text-gray-400 text-sm">Select a game above to view your collection for it.</p>
      )}

      {loadingEntries && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {selectedGame && !loadingEntries && (
        <>
          {/* Stats */}
          {items.size > 0 && (() => {
            const total = items.size;
            const owned = entries.filter((e) => e.owned).length;
            const pct = total > 0 ? Math.round((owned / total) * 100) : 0;

            const sectionStats = sections.map((sec) => {
              const secItems = Array.from(items.values()).filter((i) => i.section_id === sec.id);
              const secOwned = entries.filter((e) => secItems.some((i) => i.id === e.item_id)).length;
              return { ...sec, total: secItems.length, owned: secOwned };
            }).filter((s) => s.total > 0);

            return (
              <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Overall completion</span>
                  <span className="text-gray-400">{owned} / {total} ({pct}%)</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-white rounded-full h-2 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {sectionStats.length > 1 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                    {sectionStats.map((sec) => (
                      <div key={sec.id} className="text-xs">
                        <span className="text-gray-400">{sec.name}</span>
                        <span className="ml-2 text-white">{sec.owned}/{sec.total}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {entries.length === 0 ? (
            <p className="text-gray-400">
              No items tracked for {selectedGame.name} yet.{" "}
              <Link href={`/games/${selectedGame.slug}`} className="text-white hover:underline">
                Browse items →
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {entries.map((entry) => {
                const item = items.get(entry.item_id);
                if (!item) return null;
                const schema =
                  (item.type_schema_id && schemas.find((s) => s.id === item.type_schema_id)) ||
                  schemas.find((s) => s.section_id === item.section_id) ||
                  schemas.find((s) => s.section_id === null);
                return (
                  <ItemCard
                    key={entry.id}
                    item={item}
                    attrMap={attrMap}
                    layout={schema?.card_layout ?? null}
                    linkMode="image"
                    footer={
                      <>
                        <div className="flex gap-2 text-xs text-gray-400 mt-1">
                          {entry.level && <span>Lv.{entry.level}</span>}
                          {entry.constellation_level != null && <span>C{entry.constellation_level}</span>}
                        </div>
                        <div className="flex gap-1 mt-1">
                          <button
                            onClick={() => openEdit(entry)}
                            className="flex-1 text-xs py-1 rounded bg-gray-800 hover:bg-gray-700 transition"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeEntry(entry.item_id)}
                            className="text-xs px-2 py-1 rounded bg-gray-800 hover:bg-red-900 text-red-400 transition"
                          >
                            ✕
                          </button>
                        </div>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Edit modal */}
      {editing && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={() => setEditing(null)}
        >
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-80 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-semibold text-lg">
              {(items.get(editing.item_id)?.data?.name as string) ?? "Edit item"}
            </h2>
            {[
              { label: "Level (1–90)", key: "level" as const },
              { label: "Ascension (0–6)", key: "ascension" as const },
              { label: "Constellation (0–6)", key: "constellation_level" as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="text-xs text-gray-400 block mb-1">{label}</label>
                <input
                  type="number"
                  value={editForm[key]}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button
                onClick={saveEdit}
                className="flex-1 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 transition"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-2 rounded-lg border border-gray-700 text-sm hover:border-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
