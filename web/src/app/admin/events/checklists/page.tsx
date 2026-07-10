"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, checklistApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { extractApiError } from "@/lib/errors";

interface GameOpt {
  id: string;
  slug: string;
  name: string;
}

type Cadence = "daily" | "weekly" | "monthly" | "interval";

interface TemplateRow {
  id?: string;
  title: string;
  cadence_kind: Cadence;
  interval_days: number;
  reset_weekday: number;
  reset_day_of_month: number;
  is_published: boolean;
  sort_order: number;
}

const CADENCES: Cadence[] = ["daily", "weekly", "monthly", "interval"];
const CADENCE_LABEL: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  interval: "Every N days",
};

function weekdayName(wd0Mon: number): string {
  const d = new Date(Date.UTC(2024, 0, 1 + wd0Mon)); // 2024-01-01 is a Monday
  return new Intl.DateTimeFormat("en", { weekday: "long" }).format(d);
}

function blankRow(sort: number): TemplateRow {
  return {
    title: "",
    cadence_kind: "daily",
    interval_days: 3,
    reset_weekday: 0,
    reset_day_of_month: 1,
    is_published: true,
    sort_order: sort,
  };
}

export default function AdminChecklistsPage() {
  const { user, isLoading } = useAdminGuard("/admin/events/checklists");
  const [games, setGames] = useState<GameOpt[]>([]);
  const [gameId, setGameId] = useState("");
  const [rows, setRows] = useState<TemplateRow[]>([]);
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
    checklistApi
      .listTemplates(gameId)
      .then((r) => {
        const data = (r.data.data ?? []) as Array<Record<string, unknown>>;
        setRows(
          data.map((t, i) => ({
            id: t.id as string,
            title: (t.title as string) ?? "",
            cadence_kind: (t.cadence_kind as Cadence) ?? "daily",
            interval_days: (t.interval_days as number) ?? 3,
            reset_weekday: (t.reset_weekday as number) ?? 0,
            reset_day_of_month: (t.reset_day_of_month as number) ?? 1,
            is_published: (t.is_published as boolean) ?? true,
            sort_order: (t.sort_order as number) ?? i,
          })),
        );
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [gameId]);

  const update = (i: number, patch: Partial<TemplateRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, idx) => idx !== i));
  const addRow = () => setRows((rs) => [...rs, blankRow(rs.length)]);

  const save = async () => {
    setError("");
    setSaved(false);
    for (const r of rows) {
      if (!r.title.trim()) {
        setError("Every task needs a title.");
        return;
      }
    }
    setSaving(true);
    try {
      // Preserve ids (replace-set keeps stable ids so users' completions
      // survive an edit); send only the cadence fields each kind needs.
      const payload = rows.map((r, i) => ({
        ...(r.id ? { id: r.id } : {}),
        title: r.title.trim(),
        cadence_kind: r.cadence_kind,
        interval_days: r.cadence_kind === "interval" ? Math.max(1, r.interval_days) : null,
        reset_weekday: r.cadence_kind === "weekly" ? r.reset_weekday : null,
        reset_day_of_month: r.cadence_kind === "monthly" ? r.reset_day_of_month : null,
        is_published: r.is_published,
        sort_order: i,
      }));
      const res = await checklistApi.setTemplates(gameId, payload);
      const data = (res.data.data ?? []) as Array<Record<string, unknown>>;
      setRows(
        data.map((t, i) => ({
          id: t.id as string,
          title: (t.title as string) ?? "",
          cadence_kind: (t.cadence_kind as Cadence) ?? "daily",
          interval_days: (t.interval_days as number) ?? 3,
          reset_weekday: (t.reset_weekday as number) ?? 0,
          reset_day_of_month: (t.reset_day_of_month as number) ?? 1,
          is_published: (t.is_published as boolean) ?? true,
          sort_order: (t.sort_order as number) ?? i,
        })),
      );
      setSaved(true);
    } catch (e: unknown) {
      setError(extractApiError(e, "Failed to save checklist tasks"));
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

  const fieldClass =
    "px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white";

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/admin/events" className="text-gray-400 hover:text-white text-sm">
          ← Events
        </Link>
      </div>
      <h1 className="text-3xl font-semibold mb-2">Checklist Defaults</h1>
      <p className="text-gray-400 mb-8">
        Author the default recurring tasks players see for a game (daily commissions, weekly
        bosses, …). Players can hide any of these and add their own. Reset times come from each
        game&apos;s{" "}
        <Link href="/admin/events/servers" className="underline hover:text-amber-300">
          server settings
        </Link>
        .
      </p>

      <select
        value={gameId}
        onChange={(e) => setGameId(e.target.value)}
        className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm mb-6 focus:outline-none focus:border-white"
      >
        <option value="">Select a game…</option>
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>

      {gameId && (
        <>
          {loading ? (
            <div className="h-24 rounded-xl bg-gray-800 animate-pulse" />
          ) : (
            <div className="space-y-2">
              {rows.length === 0 && (
                <p className="rounded-xl border border-gray-800 p-5 text-center text-gray-400 text-sm">
                  No default tasks yet. Add some below, or leave empty to let players build their
                  own.
                </p>
              )}

              {rows.map((r, i) => (
                <div
                  key={r.id ?? `new-${i}`}
                  className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <input
                      value={r.title}
                      onChange={(e) => update(i, { title: e.target.value })}
                      placeholder="Task title (e.g. Daily commissions)"
                      className={`${fieldClass} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="px-3 py-2 rounded-lg border border-gray-700 text-red-400 hover:border-red-900 text-sm"
                      aria-label="Remove task"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={r.cadence_kind}
                      onChange={(e) => update(i, { cadence_kind: e.target.value as Cadence })}
                      className={fieldClass}
                    >
                      {CADENCES.map((c) => (
                        <option key={c} value={c}>
                          {CADENCE_LABEL[c]}
                        </option>
                      ))}
                    </select>

                    {r.cadence_kind === "weekly" && (
                      <select
                        value={r.reset_weekday}
                        onChange={(e) => update(i, { reset_weekday: Number(e.target.value) })}
                        className={fieldClass}
                      >
                        {Array.from({ length: 7 }).map((_, wd) => (
                          <option key={wd} value={wd}>
                            {weekdayName(wd)}
                          </option>
                        ))}
                      </select>
                    )}

                    {r.cadence_kind === "monthly" && (
                      <select
                        value={r.reset_day_of_month}
                        onChange={(e) =>
                          update(i, { reset_day_of_month: Number(e.target.value) })
                        }
                        className={fieldClass}
                      >
                        {Array.from({ length: 28 }).map((_, d) => (
                          <option key={d + 1} value={d + 1}>
                            Day {d + 1}
                          </option>
                        ))}
                      </select>
                    )}

                    {r.cadence_kind === "interval" && (
                      <label className="flex items-center gap-2 text-sm text-gray-400">
                        Every
                        <input
                          type="number"
                          min={1}
                          value={r.interval_days}
                          onChange={(e) =>
                            update(i, {
                              interval_days: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                          className={`${fieldClass} w-20`}
                        />
                        days
                      </label>
                    )}

                    <label className="ml-auto flex items-center gap-2 text-sm text-gray-400">
                      <input
                        type="checkbox"
                        checked={r.is_published}
                        onChange={(e) => update(i, { is_published: e.target.checked })}
                      />
                      Published
                    </label>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addRow}
                className="text-sm text-gray-400 hover:text-amber-300 transition mt-1"
              >
                + Add task
              </button>
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
              {saving ? "Saving…" : "Save checklist"}
            </button>
          </div>
        </>
      )}
    </main>
  );
}
