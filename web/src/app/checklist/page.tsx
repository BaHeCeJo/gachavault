"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  useGames,
  useEventFollows,
  useChecklist,
  useToggleChecklistTask,
  useCreateCustomTask,
  useDeleteCustomTask,
  useSetHiddenTemplates,
} from "@/hooks/queries";
import { useAuth } from "@/context/AuthContext";

interface GameOption {
  id: string;
  slug: string;
  name: string;
}

interface Follow {
  game_id: string;
}

interface ChecklistTask {
  id: string;
  source: "template" | "custom";
  editable: boolean;
  title: string;
  description: string | null;
  cadence_kind: string;
  interval_days: number | null;
  reset_weekday: number | null;
  reset_day_of_month: number | null;
  sort_order: number;
  period_key: string;
  resets_at: string;
  done: boolean;
}

interface HiddenTemplate {
  id: string;
  title: string;
  cadence_kind: string;
}

interface ChecklistData {
  game_id: string;
  server: { key: string; name: string; timezone: string; reset_hour: number } | null;
  tasks: ChecklistTask[];
  hidden_templates: HiddenTemplate[];
}

// Cadence groups, in display order.
const CADENCES = ["daily", "weekly", "monthly", "interval"] as const;
type Cadence = (typeof CADENCES)[number];

function weekdayName(locale: string, wd0Mon: number): string {
  // 2024-01-01 is a Monday; offset by the 0=Mon..6=Sun index.
  const d = new Date(Date.UTC(2024, 0, 1 + wd0Mon));
  return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(d);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function ChecklistPage() {
  const t = useTranslations("checklist");
  const locale = useLocale();
  const { user, isLoading: authLoading } = useAuth();

  const { data: games = [] as GameOption[] } = useGames();
  const { data: follows = [] as Follow[] } = useEventFollows(!!user);

  // A "now" clock kept in state (set after mount, then ticked every minute) so
  // the "resets in …" countdowns stay fresh without reading Date.now() during
  // render. Starts at 0 → countdowns render once the effect has run.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Default to the first followed game, else the first game overall.
  const [gameId, setGameId] = useState<string>("");
  useEffect(() => {
    if (gameId) return;
    const preferred = follows[0]?.game_id ?? games[0]?.id;
    if (preferred) setGameId(preferred);
  }, [gameId, follows, games]);

  const { data, isLoading } = useChecklist(gameId, !!user) as {
    data: ChecklistData | undefined;
    isLoading: boolean;
  };

  const toggle = useToggleChecklistTask(gameId);
  const createTask = useCreateCustomTask(gameId);
  const deleteTask = useDeleteCustomTask(gameId);
  const setHidden = useSetHiddenTemplates(gameId);

  const rtf = useMemo(() => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }), [locale]);
  function resetsIn(iso: string): string {
    const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000);
    if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
    const hours = Math.round(diffMin / 60);
    if (Math.abs(hours) < 48) return rtf.format(hours, "hour");
    return rtf.format(Math.round(hours / 24), "day");
  }

  function cadenceLabel(task: ChecklistTask): string {
    switch (task.cadence_kind) {
      case "weekly":
        return t("cadence.weeklyOn", { day: weekdayName(locale, task.reset_weekday ?? 0) });
      case "monthly":
        return t("cadence.monthlyOn", { day: ordinal(task.reset_day_of_month ?? 1) });
      case "interval":
        return t("cadence.everyNDays", { n: task.interval_days ?? 1 });
      default:
        return t("cadence.daily");
    }
  }

  const grouped = useMemo(() => {
    const map: Record<Cadence, ChecklistTask[]> = {
      daily: [],
      weekly: [],
      monthly: [],
      interval: [],
    };
    for (const task of data?.tasks ?? []) {
      const key = (CADENCES as readonly string[]).includes(task.cadence_kind)
        ? (task.cadence_kind as Cadence)
        : "daily";
      map[key].push(task);
    }
    return map;
  }, [data]);

  const hiddenIds = useMemo(
    () => (data?.hidden_templates ?? []).map((h) => h.id),
    [data],
  );

  if (!authLoading && !user) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-semibold mb-4">{t("title")}</h1>
        <p className="text-gray-400">{t("signInToUse")}</p>
      </main>
    );
  }

  const doneCount = (data?.tasks ?? []).filter((x) => x.done).length;
  const totalCount = (data?.tasks ?? []).length;

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-semibold">{t("title")}</h1>
        <Link href="/calendar" className="text-sm text-gray-400 hover:text-amber-300 transition">
          {t("toCalendar")} →
        </Link>
      </div>
      <p className="text-gray-400 mb-6">{t("subtitle")}</p>

      {/* Game picker + server / progress line */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          aria-label={t("selectGame")}
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-amber-500/60 focus:outline-none"
        >
          {games.map((g: GameOption) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {totalCount > 0 && (
          <span className="text-sm text-gray-400">
            {t("progress", { done: doneCount, total: totalCount })}
          </span>
        )}
      </div>

      {data?.server ? (
        <p className="text-xs text-gray-500 mb-6">
          {t("resetContext", {
            server: data.server.name,
            hour: String(data.server.reset_hour).padStart(2, "0"),
          })}
        </p>
      ) : (
        <p className="text-xs text-amber-500/80 mb-6">
          {t("noServerHint")}{" "}
          <Link href="/calendar/tracked" className="underline hover:text-amber-300">
            {t("pickServer")}
          </Link>
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {CADENCES.map((cadence) => {
            const tasks = grouped[cadence];
            if (tasks.length === 0) return null;
            const nextReset = tasks
              .map((x) => x.resets_at)
              .sort()[0];
            return (
              <section key={cadence}>
                <div className="flex items-baseline justify-between mb-2">
                  <h2 className="text-lg font-semibold text-gray-200">
                    {t(`groups.${cadence}`)}
                  </h2>
                  {nextReset && now > 0 && (
                    <span className="text-xs text-gray-500">
                      {t("resetsRel", { rel: resetsIn(nextReset) })}
                    </span>
                  )}
                </div>
                <ul className="space-y-2">
                  {tasks.map((task) => (
                    <li
                      key={`${task.source}:${task.id}`}
                      className="group flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3"
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={task.done}
                        aria-label={task.title}
                        onClick={() =>
                          toggle.mutate({
                            source: task.source,
                            task_id: task.id,
                            done: !task.done,
                          })
                        }
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border transition ${
                          task.done
                            ? "border-amber-500 bg-amber-500 text-black"
                            : "border-gray-600 hover:border-amber-500/70"
                        }`}
                      >
                        {task.done && (
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                            <path
                              fillRule="evenodd"
                              d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.3 3.3 6.8-6.8a1 1 0 0 1 1.4 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm ${
                            task.done ? "text-gray-500 line-through" : "text-gray-100"
                          }`}
                        >
                          {task.title}
                        </p>
                        {task.cadence_kind !== "daily" && (
                          <p className="text-xs text-gray-500">{cadenceLabel(task)}</p>
                        )}
                      </div>
                      {task.source === "custom" ? (
                        <button
                          type="button"
                          onClick={() => deleteTask.mutate(task.id)}
                          aria-label={t("deleteTask")}
                          className="text-gray-600 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        >
                          ✕
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setHidden.mutate([...hiddenIds, task.id])}
                          aria-label={t("hideTask")}
                          title={t("hideTask")}
                          className="text-gray-600 opacity-0 transition hover:text-gray-300 group-hover:opacity-100"
                        >
                          {/* eye-off */}
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A9.6 9.6 0 0112 4c5 0 9 4.5 9 8a10 10 0 01-1.7 3M6.1 6.1A10.6 10.6 0 003 12c0 3.5 4 8 9 8 1.4 0 2.7-.3 3.9-.9" />
                          </svg>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {totalCount === 0 && (
            <p className="text-gray-500 text-sm">{t("empty")}</p>
          )}

          <AddTaskForm
            onCreate={(payload) => createTask.mutate({ game_id: gameId, ...payload })}
            pending={createTask.isPending}
            locale={locale}
          />

          {(data?.hidden_templates?.length ?? 0) > 0 && (
            <HiddenDefaults
              hidden={data!.hidden_templates}
              onRestore={(id) => setHidden.mutate(hiddenIds.filter((x) => x !== id))}
            />
          )}
        </div>
      )}
    </main>
  );
}

// ── Add-custom-task form ─────────────────────────────────────────────────────

interface NewTaskPayload {
  title: string;
  cadence_kind: string;
  interval_days?: number;
  reset_weekday?: number;
  reset_day_of_month?: number;
}

function AddTaskForm({
  onCreate,
  pending,
  locale,
}: {
  onCreate: (payload: NewTaskPayload) => void;
  pending: boolean;
  locale: string;
}) {
  const t = useTranslations("checklist");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [cadence, setCadence] = useState<Cadence>("daily");
  const [weekday, setWeekday] = useState(0);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [intervalDays, setIntervalDays] = useState(3);

  function submit() {
    const name = title.trim();
    if (!name) return;
    const payload: NewTaskPayload = { title: name, cadence_kind: cadence };
    if (cadence === "weekly") payload.reset_weekday = weekday;
    if (cadence === "monthly") payload.reset_day_of_month = dayOfMonth;
    if (cadence === "interval") payload.interval_days = Math.max(1, intervalDays);
    onCreate(payload);
    setTitle("");
    setCadence("daily");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-xl border border-dashed border-gray-700 px-4 py-3 text-sm text-gray-400 transition hover:border-amber-500/60 hover:text-amber-300"
      >
        {t("addTask")}
      </button>
    );
  }

  const fieldClass =
    "rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-amber-500/60 focus:outline-none";

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={t("taskTitlePlaceholder")}
        className={`${fieldClass} w-full`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={t("selectCadence")}
          value={cadence}
          onChange={(e) => setCadence(e.target.value as Cadence)}
          className={fieldClass}
        >
          {CADENCES.map((c) => (
            <option key={c} value={c}>
              {t(`groups.${c}`)}
            </option>
          ))}
        </select>

        {cadence === "weekly" && (
          <select
            aria-label={t("selectWeekday")}
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
            className={fieldClass}
          >
            {Array.from({ length: 7 }).map((_, i) => (
              <option key={i} value={i}>
                {weekdayName(locale, i)}
              </option>
            ))}
          </select>
        )}

        {cadence === "monthly" && (
          <select
            aria-label={t("selectDayOfMonth")}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Number(e.target.value))}
            className={fieldClass}
          >
            {Array.from({ length: 28 }).map((_, i) => (
              <option key={i + 1} value={i + 1}>
                {ordinal(i + 1)}
              </option>
            ))}
          </select>
        )}

        {cadence === "interval" && (
          <label className="flex items-center gap-2 text-sm text-gray-400">
            {t("everyLabel")}
            <input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
              className={`${fieldClass} w-20`}
            />
            {t("daysLabel")}
          </label>
        )}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || !title.trim()}
          onClick={submit}
          className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-black transition hover:bg-amber-400 disabled:opacity-50"
        >
          {t("add")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 transition hover:text-white"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}

// ── Restore hidden defaults ──────────────────────────────────────────────────

function HiddenDefaults({
  hidden,
  onRestore,
}: {
  hidden: HiddenTemplate[];
  onRestore: (id: string) => void;
}) {
  const t = useTranslations("checklist");
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-gray-500 hover:text-gray-300 transition"
      >
        {open ? "▾" : "▸"} {t("hiddenCount", { n: hidden.length })}
      </button>
      {open && (
        <ul className="mt-2 space-y-1">
          {hidden.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between rounded-lg border border-gray-800 px-3 py-2 text-sm text-gray-400"
            >
              <span className="truncate">{h.title}</span>
              <button
                type="button"
                onClick={() => onRestore(h.id)}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                {t("restore")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
