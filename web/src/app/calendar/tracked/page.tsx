"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useGames, useEventFollows, useUpsertFollow, useDeleteFollow } from "@/hooks/queries";
import { eventsApi } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface GameOption {
  id: string;
  slug: string;
  name: string;
}

interface ServerDef {
  key: string;
  name: string;
}

interface Follow {
  game_id: string;
  game_slug: string;
  game_name: string;
  event_types: string[] | null;
  server: string | null;
  created_at: string;
}

const EVENT_TYPES = ["banner", "version", "limited_event", "maintenance"] as const;

// Toggle one type in a follow's filter. null = "all types"; we normalize the
// two degenerate cases (none selected, or every type selected) back to null so
// the stored filter stays meaningful — following a game with zero allowed
// types would surface no events at all.
function nextTypes(current: string[] | null, type: string): string[] | null {
  const all = EVENT_TYPES as readonly string[];
  const set = new Set<string>(current ?? all);
  if (set.has(type)) set.delete(type);
  else set.add(type);
  if (set.size === 0 || set.size === all.length) return null;
  return all.filter((t) => set.has(t));
}

export default function TrackedGamesPage() {
  const t = useTranslations("calendar");
  const { user, isLoading: authLoading } = useAuth();

  const { data: games = [] as GameOption[], isLoading: gamesLoading } = useGames();
  const { data: follows = [] as Follow[] } = useEventFollows(!!user);
  const upsert = useUpsertFollow();
  const remove = useDeleteFollow();

  const followByGame = new Map<string, Follow>(follows.map((f: Follow) => [f.game_id, f]));
  const busy = upsert.isPending || remove.isPending;

  // Lazy-load each followed game's servers so we can offer a home-server picker.
  const [serversByGame, setServersByGame] = useState<Record<string, ServerDef[]>>({});
  useEffect(() => {
    for (const f of follows as Follow[]) {
      if (serversByGame[f.game_id] !== undefined) continue;
      eventsApi
        .getServers(f.game_id)
        .then((r) => setServersByGame((m) => ({ ...m, [f.game_id]: r.data.data ?? [] })))
        .catch(() => setServersByGame((m) => ({ ...m, [f.game_id]: [] })));
    }
  }, [follows, serversByGame]);

  if (!authLoading && !user) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold mb-4">{t("trackedTitle")}</h1>
        <p className="text-gray-400">{t("signInToTrack")}</p>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-semibold">{t("trackedTitle")}</h1>
        <Link href="/calendar" className="text-sm text-gray-400 hover:text-amber-300 transition">
          {t("title")} →
        </Link>
      </div>
      <p className="text-gray-400 mb-8">{t("trackedSubtitle")}</p>

      {gamesLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((g: GameOption) => {
            const follow = followByGame.get(g.id);
            const following = !!follow;
            return (
              <div key={g.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="font-semibold">{g.name}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      following
                        ? remove.mutate(g.id)
                        : upsert.mutate({ gameId: g.id, eventTypes: null, server: null })
                    }
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-50 ${
                      following
                        ? "bg-amber-500 text-black hover:bg-amber-400"
                        : "border border-gray-700 text-gray-300 hover:border-amber-500/60 hover:text-amber-300"
                    }`}
                  >
                    {following ? t("following") : t("follow")}
                  </button>
                </div>

                {following && (
                  <div className="mt-3 pt-3 border-t border-gray-800 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {EVENT_TYPES.map((ty) => {
                        const active =
                          follow!.event_types === null || follow!.event_types.includes(ty);
                        return (
                          <button
                            key={ty}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              upsert.mutate({
                                gameId: g.id,
                                eventTypes: nextTypes(follow!.event_types, ty),
                                server: follow!.server ?? null,
                              })
                            }
                            className={`text-xs px-3 py-1 rounded-full border transition disabled:opacity-50 ${
                              active
                                ? "border-amber-600/60 bg-amber-900/20 text-amber-300"
                                : "border-gray-700 text-gray-500 hover:text-gray-300"
                            }`}
                          >
                            {t(`types.${ty}`)}
                          </button>
                        );
                      })}
                    </div>

                    {(serversByGame[g.id]?.length ?? 0) > 0 && (
                      <label className="flex items-center gap-2 text-xs text-gray-400">
                        {t("yourServer")}
                        <select
                          disabled={busy}
                          value={follow!.server ?? ""}
                          onChange={(e) =>
                            upsert.mutate({
                              gameId: g.id,
                              eventTypes: follow!.event_types ?? null,
                              server: e.target.value || null,
                            })
                          }
                          className="rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-white disabled:opacity-50"
                        >
                          <option value="">{t("allServers")}</option>
                          {serversByGame[g.id].map((s) => (
                            <option key={s.key} value={s.key}>{s.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
