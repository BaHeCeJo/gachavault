"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { collectionsApi, gamesApi, itemsApi, usersApi } from "@/lib/api";
import { Avatar } from "@/components/Avatar";

interface PublicUser {
  id: string;
  username: string;
  avatar_url: string | null;
  created_at: string;
}

interface CollectionEntry {
  item_id: string;
  game_id: string;
  owned: boolean;
}

interface Game {
  id: string;
  slug: string;
  name: string;
}

interface GameStat {
  game: Game;
  ownedCount: number;
}

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [gameStats, setGameStats] = useState<GameStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    usersApi
      .getPublicProfile(username)
      .then(async (r) => {
        const user: PublicUser = r.data.data;
        setProfile(user);

        const [entriesRes, gamesRes] = await Promise.all([
          collectionsApi.getUserCollection(user.id),
          gamesApi.list(),
        ]);

        const entries: CollectionEntry[] = entriesRes.data.data ?? [];
        const games: Game[] = gamesRes.data.data ?? [];

        const owned = entries.filter((e) => e.owned);
        const countsByGame = new Map<string, number>();
        for (const e of owned) {
          countsByGame.set(e.game_id, (countsByGame.get(e.game_id) ?? 0) + 1);
        }

        const stats: GameStat[] = [];
        for (const [gameId, count] of Array.from(countsByGame.entries())) {
          const game = games.find((g) => g.id === gameId);
          if (game) stats.push({ game, ownedCount: count });
        }
        stats.sort((a, b) => b.ownedCount - a.ownedCount);
        setGameStats(stats);
      })
      .catch(() => setError("User not found"))
      .finally(() => setLoading(false));
  }, [username]);

  if (loading) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <div className="h-24 rounded-xl bg-gray-800 animate-pulse mb-4" />
        <div className="h-48 rounded-xl bg-gray-800 animate-pulse" />
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-red-400">{error || "User not found"}</p>
        <Link href="/" className="text-sm text-gray-400 hover:text-white mt-4 inline-block">← Home</Link>
      </main>
    );
  }

  const totalOwned = gameStats.reduce((s, g) => s + g.ownedCount, 0);

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Profile header */}
      <div className="flex items-center gap-5 rounded-xl border border-gray-800 bg-gray-900 p-6">
        <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={64} />
        <div>
          <h1 className="text-2xl font-bold">{profile.username}</h1>
          <p className="text-sm text-gray-400 mt-1">
            Member since {new Date(profile.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long" })}
          </p>
        </div>
      </div>

      {/* Collection stats */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Collection</h2>
        {gameStats.length === 0 ? (
          <p className="text-gray-400">No public collection yet.</p>
        ) : (
          <>
            <p className="text-sm text-gray-400 mb-4">{totalOwned} item{totalOwned !== 1 ? "s" : ""} owned across {gameStats.length} game{gameStats.length !== 1 ? "s" : ""}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {gameStats.map(({ game, ownedCount }) => (
                <Link
                  key={game.id}
                  href={`/games/${game.slug}`}
                  className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-5 py-4 hover:border-gray-600 transition"
                >
                  <span className="font-medium">{game.name}</span>
                  <span className="text-sm text-gray-400">{ownedCount} owned</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
