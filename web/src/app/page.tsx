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
      <section className="flex flex-col items-center justify-center flex-1 px-6 py-20 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">{t("title")}</h1>
        <p className="text-xl text-gray-400 mb-10 max-w-lg">{t("subtitle")}</p>

        <form onSubmit={handleSearch} className="w-full max-w-xl flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="flex-1 px-4 py-3 rounded-lg bg-gray-900 border border-gray-700 focus:outline-none focus:border-white text-sm"
          />
          <button
            type="submit"
            className="px-6 py-3 bg-white text-black rounded-lg font-semibold text-sm hover:bg-gray-200 transition"
          >
            {t("searchButton")}
          </button>
        </form>

        <div className="flex gap-4 mt-8">
          <Link
            href="/games"
            className="px-5 py-2.5 border border-gray-700 rounded-lg text-sm font-medium hover:border-white transition"
          >
            {t("browseGames")}
          </Link>
          <Link
            href="/auth/register"
            className="px-5 py-2.5 border border-gray-700 rounded-lg text-sm font-medium hover:border-white transition"
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
            <Link href="/games" className="text-sm text-gray-400 hover:text-white">
              {t("viewAll")} →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {games.map((g: Game) => (
              <Link
                key={g.id}
                href={`/games/${g.slug}`}
                className="group relative rounded-xl border border-gray-800 bg-gray-900 overflow-hidden hover:border-gray-600 transition"
              >
                <div className="relative h-28 w-full">
                  <SafeImage
                    src={g.banner_url}
                    alt={g.name}
                    fill
                    className="object-cover"
                    fallback={
                      <div className="h-28 w-full bg-gradient-to-br from-gray-800 to-gray-700 flex items-center justify-center text-3xl font-bold text-gray-600">
                        {g.name[0]}
                      </div>
                    }
                  />
                </div>
                <div className="p-3">
                  <p className="font-semibold text-sm group-hover:text-white transition">
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
