"use client";

import Link from "next/link";
import { useGames } from "@/hooks/queries";
import { SafeImage } from "@/components/SafeImage";

interface Game {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  banner_url: string | null;
}

const PALETTE = ["from-amber-900 to-amber-700", "from-violet-900 to-violet-700", "from-blue-900 to-blue-700", "from-cyan-900 to-cyan-700", "from-purple-900 to-purple-700"];
function cardGradient(name: string) {
  return PALETTE[name.charCodeAt(0) % PALETTE.length];
}

export default function GamesPage() {
  const { data: games = [] as Game[], isLoading, isError } = useGames();

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-8">Games</h1>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {isError && <div className="text-red-400">Failed to load games</div>}

      {!isLoading && !isError && games.length === 0 && (
        <p className="text-gray-400">No games yet — check back soon.</p>
      )}

      {!isLoading && games.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {games.map((game: Game) => (
            <Link
              key={game.id}
              href={`/games/${game.slug}`}
              className="group relative flex flex-col rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 hover:scale-[1.02] transition-all duration-200"
            >
              <div className="relative h-32 w-full">
                <SafeImage
                  src={game.banner_url}
                  alt={game.name}
                  fill
                  className="object-cover group-hover:brightness-110 transition duration-200"
                  fallback={
                    <div className={`h-32 w-full bg-gradient-to-br ${cardGradient(game.name)} flex items-center justify-center text-4xl font-bold text-white/60`}>
                      {game.name[0]}
                    </div>
                  }
                />
              </div>
              <div className="p-3">
                <h2 className="font-semibold text-sm group-hover:text-amber-300 transition">
                  {game.name}
                </h2>
                {game.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{game.description}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
