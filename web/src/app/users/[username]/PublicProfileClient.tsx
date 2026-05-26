"use client";

import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import type { PublicProfileBundle } from "@/lib/seo";

interface ClientProps {
  initial: PublicProfileBundle;
}

export default function PublicProfileClient({ initial }: ClientProps) {
  const { user: profile, gameStats, totalOwned } = initial;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 space-y-8">
      {/* Profile header */}
      <div className="flex items-center gap-5 rounded-xl border border-gray-800 bg-gray-900 p-6">
        <Avatar username={profile.username} avatarUrl={profile.avatar_url} size={64} />
        <div>
          <h1 className="text-2xl font-semibold">{profile.username}</h1>
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
                  <span>{game.name}</span>
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
