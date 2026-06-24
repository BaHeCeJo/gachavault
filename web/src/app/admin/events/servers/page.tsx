"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, eventsApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { extractApiError } from "@/lib/errors";

interface GameOpt {
  id: string;
  slug: string;
  name: string;
}

interface ServerRow {
  key: string;
  name: string;
  timezone: string;
  sort_order: number;
}

const TZ_OPTIONS = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "America/New_York",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/Paris",
  "Europe/London",
];

// The standard 3-region setup most HoYo/Kuro games use.
const STANDARD_SERVERS: ServerRow[] = [
  { key: "asia", name: "Asia", timezone: "Asia/Shanghai", sort_order: 0 },
  { key: "europe", name: "Europe", timezone: "Europe/Paris", sort_order: 1 },
  { key: "america", name: "America", timezone: "America/New_York", sort_order: 2 },
];

export default function AdminServersPage() {
  const { user, isLoading } = useAdminGuard("/admin/events/servers");
  const [games, setGames] = useState<GameOpt[]>([]);
  const [gameId, setGameId] = useState("");
  const [rows, setRows] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    adminApi.games.list().then((r) => setGames(r.data.data ?? []));
  }, [user]);

  useEffect(() => {
    if (!gameId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setSaved(false);
    eventsApi
      .getServers(gameId)
      .then((r) => setRows(r.data.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [gameId]);

  const update = (i: number, patch: Partial<ServerRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const addRow = () =>
    setRows((rs) => [...rs, { key: "", name: "", timezone: "UTC", sort_order: rs.length }]);

  const save = async () => {
    setError("");
    setSaved(false);
    for (const r of rows) {
      if (!r.key || !r.name) {
        setError("Every server needs a key and a name.");
        return;
      }
    }
    setSaving(true);
    try {
      const payload = rows.map((r, i) => ({ ...r, sort_order: i }));
      const res = await eventsApi.setServers(gameId, payload);
      setRows(res.data.data ?? []);
      setSaved(true);
    } catch (e: unknown) {
      setError(extractApiError(e, "Failed to save servers"));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/admin/events" className="text-gray-400 hover:text-white text-sm">← Events</Link>
      </div>
      <h1 className="text-3xl font-semibold mb-2">Game Servers</h1>
      <p className="text-gray-400 mb-8">
        Define each game&apos;s regional servers. Events can then carry a different start/end per
        server, and players pick their home server when following a game.
      </p>

      <select
        value={gameId}
        onChange={(e) => setGameId(e.target.value)}
        className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm mb-6 focus:outline-none focus:border-white"
      >
        <option value="">Select a game…</option>
        {games.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>

      {gameId && (
        <>
          {loading ? (
            <div className="h-24 rounded-xl bg-gray-800 animate-pulse" />
          ) : (
            <div className="space-y-2">
              {rows.length === 0 && (
                <div className="rounded-xl border border-gray-800 p-5 text-center">
                  <p className="text-gray-400 text-sm mb-3">
                    No servers yet. Single-server games can be left empty.
                  </p>
                  <button
                    type="button"
                    onClick={() => setRows(STANDARD_SERVERS.map((s) => ({ ...s })))}
                    className="text-sm px-4 py-2 rounded-lg border border-gray-700 hover:border-amber-500/60 hover:text-amber-300 transition"
                  >
                    + Add standard Asia / Europe / America
                  </button>
                </div>
              )}

              {rows.map((r, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1.4fr_auto] gap-2 items-center">
                  <input
                    value={r.key}
                    onChange={(e) => update(i, { key: e.target.value })}
                    placeholder="key (asia)"
                    className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm font-mono focus:outline-none focus:border-white"
                  />
                  <input
                    value={r.name}
                    onChange={(e) => update(i, { name: e.target.value })}
                    placeholder="Name (Asia)"
                    className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  />
                  <select
                    value={r.timezone}
                    onChange={(e) => update(i, { timezone: e.target.value })}
                    className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  >
                    {(TZ_OPTIONS.includes(r.timezone) ? TZ_OPTIONS : [r.timezone, ...TZ_OPTIONS]).map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="px-3 py-2 rounded-lg border border-gray-700 text-red-400 hover:border-red-900 text-sm"
                  >
                    ✕
                  </button>
                </div>
              ))}

              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={addRow}
                  className="text-sm text-gray-400 hover:text-amber-300 transition mt-1"
                >
                  + Add server
                </button>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
          {saved && <p className="text-green-400 text-sm mt-4">Saved.</p>}

          <div className="mt-6">
            <button
              onClick={save}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save servers"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
