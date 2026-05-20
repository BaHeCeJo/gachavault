"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchApi, gamesApi } from "@/lib/api";
import { Suspense } from "react";
import { SafeImage } from "@/components/SafeImage";

interface SearchHit {
  id: string;
  slug: string;
  name: string;
  game_slug: string;
  section_slug: string | null;
  data: Record<string, unknown>;
}

interface Game { id: string; slug: string; name: string }
interface Section { id: string; slug: string; name: string }

function SearchContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initialQ = params.get("q") ?? "";
  const initialGame = params.get("game") ?? "";
  const initialSection = params.get("section") ?? "";

  const initialSort = params.get("sort") ?? "";

  const [q, setQ] = useState(initialQ);
  const [gameFilter, setGameFilter] = useState(initialGame);
  const [sectionFilter, setSectionFilter] = useState(initialSection);
  const [sortOrder, setSortOrder] = useState(initialSort);
  const [games, setGames] = useState<Game[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    gamesApi.list().then((r) => setGames(r.data.data ?? [])).catch(() => {});
  }, []);

  // Load sections when game changes
  useEffect(() => {
    setSectionFilter("");
    setSections([]);
    if (!gameFilter) return;
    gamesApi.getSections(gameFilter)
      .then((r) => setSections(r.data.data ?? []))
      .catch(() => {});
  }, [gameFilter]);

  const doSearch = useCallback(async (query: string, game: string, section: string, sort: string) => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const filterParams: Record<string, string> = {};
      if (game) filterParams.game = game;
      if (section) filterParams.section = section;
      if (sort) filterParams.sort = sort;
      const res = await searchApi.search(query, Object.keys(filterParams).length ? filterParams : undefined);
      setResults(res.data.data?.hits ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialQ) doSearch(initialQ, initialGame, initialSection, initialSort);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (gameFilter) p.set("game", gameFilter);
    if (sectionFilter) p.set("section", sectionFilter);
    if (sortOrder) p.set("sort", sortOrder);
    router.push(`/search?${p.toString()}`);
    doSearch(q, gameFilter, sectionFilter, sortOrder);
  };

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-6">Search</h1>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search items, characters, weapons…"
          className="flex-1 min-w-48 px-4 py-2 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:border-white text-sm"
          autoFocus
        />
        <select
          value={gameFilter}
          onChange={(e) => setGameFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:border-white"
        >
          <option value="">All games</option>
          {games.map((g) => (
            <option key={g.id} value={g.slug}>{g.name}</option>
          ))}
        </select>
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          disabled={!gameFilter || sections.length === 0}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:border-white disabled:opacity-40"
        >
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.slug}>{s.name}</option>
          ))}
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm focus:outline-none focus:border-white"
        >
          <option value="">Best match</option>
          <option value="name:asc">Name A → Z</option>
          <option value="name:desc">Name Z → A</option>
        </select>
        <button
          type="submit"
          className="px-6 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
        >
          Search
        </button>
      </form>

      {/* Active filters */}
      {(gameFilter || sectionFilter) && (
        <div className="flex gap-2 mb-4">
          {gameFilter && (
            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-800 text-xs">
              {games.find((g) => g.slug === gameFilter)?.name ?? gameFilter}
              <button
                onClick={() => { setGameFilter(""); setSectionFilter(""); }}
                className="ml-1 text-gray-400 hover:text-white"
              >×</button>
            </span>
          )}
          {sectionFilter && (
            <span className="flex items-center gap-1 px-3 py-1 rounded-full bg-gray-800 text-xs">
              {sections.find((s) => s.slug === sectionFilter)?.name ?? sectionFilter}
              <button
                onClick={() => setSectionFilter("")}
                className="ml-1 text-gray-400 hover:text-white"
              >×</button>
            </span>
          )}
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-36 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <p className="text-gray-400">No results found for &quot;{q}&quot;.</p>
      )}

      {!loading && results.length > 0 && (
        <>
          <p className="text-sm text-gray-400 mb-4">{results.length} result{results.length !== 1 ? "s" : ""}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {results.map((hit) => {
              const imageUrl = hit.data?.image_url as string | undefined;
              return (
                <Link
                  key={hit.id}
                  href={`/items/${hit.id}`}
                  className="group flex flex-col rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-600 transition"
                >
                  <div className="relative h-28 w-full">
                    <SafeImage
                      src={imageUrl}
                      alt={hit.name}
                      fill
                      className="object-cover"
                      fallback={
                        <div className="h-28 w-full bg-gray-800 flex items-center justify-center text-3xl font-bold text-gray-600">
                          {hit.name[0]?.toUpperCase()}
                        </div>
                      }
                    />
                  </div>
                  <div className="p-3">
                    <p className="font-medium text-sm group-hover:text-white truncate">{hit.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {hit.game_slug}{hit.section_slug ? ` · ${hit.section_slug}` : ""}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}

      {!searched && (
        <p className="text-gray-400 text-sm">Enter a search term above to find items across all games.</p>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
