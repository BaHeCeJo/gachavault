"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useGames } from "@/hooks/queries";
import { SafeImage } from "@/components/SafeImage";

interface Game {
  id: string;
  slug: string;
  name: string;
  banner_url: string | null;
}

const PALETTE = ["from-amber-900 to-amber-700", "from-violet-900 to-violet-700", "from-blue-900 to-blue-700", "from-cyan-900 to-cyan-700", "from-purple-900 to-purple-700"];
function cardGradient(name: string) {
  return PALETTE[name.charCodeAt(0) % PALETTE.length];
}

export default function HomePage() {
  const router = useRouter();
  const t = useTranslations("home");
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const { data: allGames = [] as Game[] } = useGames();
  const games = allGames.slice(0, 8);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <main className="min-h-[calc(100vh-57px)] flex flex-col">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center flex-1 px-6 py-20 text-center overflow-hidden">
        {/* radial glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="w-[600px] h-[400px] rounded-full bg-amber-500/15 blur-[120px]" />
        </div>

        <h1 className="relative text-5xl sm:text-6xl font-bold tracking-tight mb-4">{t("title")}</h1>
        <p className="relative text-xl text-gray-400 mb-10 max-w-lg">{t("subtitle")}</p>

        <form onSubmit={handleSearch} className="relative w-full max-w-xl flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="flex-1 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-500/50 text-sm transition"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-amber-500 text-black rounded-lg font-semibold text-sm hover:bg-amber-400 transition shadow-lg shadow-amber-500/20"
          >
            {t("searchButton")}
          </button>
        </form>

        <div className="relative flex gap-4 mt-8">
          <Link
            href="/games"
            className="px-5 py-2.5 border border-gray-700 rounded-lg text-sm font-medium hover:border-amber-400 hover:text-amber-300 transition"
          >
            {t("browseGames")}
          </Link>
          <Link
            href="/auth/register"
            className="px-5 py-2.5 border border-gray-700 rounded-lg text-sm font-medium hover:border-amber-400 hover:text-amber-300 transition"
          >
            {t("createAccount")}
          </Link>
        </div>
      </section>

      {/* Featured games */}
      {games.length > 0 && (
        <section className="max-w-7xl mx-auto w-full px-6 pb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">{t("gamesSection")}</h2>
            <Link href="/games" className="text-sm text-gray-400 hover:text-amber-300 transition">
              {t("viewAll")} →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {games.map((g: Game) => (
              <Link
                key={g.id}
                href={`/games/${g.slug}`}
                className="group relative rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-amber-500/60 hover:shadow-lg hover:shadow-amber-500/10 hover:scale-[1.02] transition-all duration-200"
              >
                <div className="relative h-28 w-full">
                  <SafeImage
                    src={g.banner_url}
                    alt={g.name}
                    fill
                    className="object-cover group-hover:brightness-110 transition duration-200"
                    fallback={
                      <div className={`h-28 w-full bg-gradient-to-br ${cardGradient(g.name)} flex items-center justify-center text-3xl font-bold text-white/60`}>
                        {g.name[0]}
                      </div>
                    }
                  />
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm group-hover:text-amber-300 transition">
                    {g.name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
