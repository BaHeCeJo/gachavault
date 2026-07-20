"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminApi, eventsApi, itemsApi } from "@/lib/api";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import { extractApiError } from "@/lib/errors";
import ImageUploadField from "@/components/ImageUploadField";
import ImageSlotThumb from "@/components/ImageSlotThumb";
import DateTimeField from "@/components/DateTimeField";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { isoToZonedInput, zonedInputToIso } from "@/lib/zonedTime";

const EVENT_TYPES = ["banner", "version", "limited_event", "maintenance"] as const;

// Server-reset zones offered in the timezone dropdown. Covers the regional
// servers gacha games actually run on; an event loaded with some other IANA
// zone keeps it (it's prepended to the options at render time).
const COMMON_TZ = [
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

interface FeaturedItem {
  item_id: string;
  slug: string;
  role: string;
  order: number;
  data: Record<string, unknown>;
}

interface ServerTimeRow {
  server_key: string;
  server_name: string;
  timezone: string;
  start_at: string;
  end_at: string | null;
}

interface EventRow {
  id: string;
  game_id: string;
  game_slug: string;
  game_name: string;
  event_type: string;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  start_at: string;
  end_at: string | null;
  timezone: string;
  is_published: boolean;
  featured_items: FeaturedItem[];
  server_times: ServerTimeRow[];
}

interface GameOpt {
  id: string;
  slug: string;
  name: string;
}

interface ItemOpt {
  id: string;
  slug: string;
  data: Record<string, unknown>;
}

interface ServerDef {
  key: string;
  name: string;
  timezone: string;
  sort_order: number;
}

interface EventForm {
  game_id: string;
  event_type: string;
  slug: string;
  title: string;
  description: string;
  image_url: string;
  start_at: string;
  end_at: string;
  timezone: string;
  is_published: boolean;
  featuredIds: string[];
  // Per-server datetime-local inputs, keyed by server key. Used only when the
  // selected game has servers defined.
  serverTimes: Record<string, { start: string; end: string }>;
}

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function itemName(data: Record<string, unknown>, slug: string): string {
  for (const k of ["name", "title", "display_name"]) {
    const v = data[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return slug;
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Auto-derived slugs must stay unique per game — the backend enforces
// UNIQUE(game_id, slug) and 409s on collision. De-dupe against the events we
// already know about for this game by appending -2, -3, …; the backend stays
// the hard guarantee for anything the client hasn't loaded.
function uniqueSlug(base: string, gameId: string, events: EventRow[]): string {
  if (!base) return base;
  const taken = new Set(events.filter((e) => e.game_id === gameId).map((e) => e.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

const emptyForm = (): EventForm => ({
  game_id: "",
  event_type: "banner",
  slug: "",
  title: "",
  description: "",
  image_url: "",
  start_at: isoToLocalInput(new Date().toISOString()),
  end_at: "",
  timezone: "UTC",
  is_published: true,
  featuredIds: [],
  serverTimes: {},
});

export default function AdminEventsPage() {
  const { user, isLoading } = useAdminGuard("/admin/events");
  const [events, setEvents] = useState<EventRow[]>([]);
  const [games, setGames] = useState<GameOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameFilter, setGameFilter] = useState("");

  const [modal, setModal] = useState<{ mode: "create" | "edit"; event?: EventRow } | null>(null);
  const [form, setForm] = useState<EventForm>(emptyForm());
  // Snapshot of the form as it was opened, to detect unsaved edits on close.
  const [initialForm, setInitialForm] = useState<EventForm>(emptyForm());
  const [gameItems, setGameItems] = useState<ItemOpt[]>([]);
  const [gameServers, setGameServers] = useState<ServerDef[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [slugLocked, setSlugLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<EventRow | null>(null);
  // Whether the datetime fields are typed in the author's local time or in the
  // server's time (e.g. HSR "Server Time" = the game's server zone). Only
  // affects how typed numbers convert to/from the stored UTC instant; the
  // stored value is always UTC either way.
  const [entryMode, setEntryMode] = useState<"local" | "server">("local");

  // Wall-clock <-> UTC honouring the current entry mode. In "server" mode the
  // typed numbers are read as local to `tz`; in "local" mode as the browser's
  // zone (legacy behaviour). The stored value is always a UTC ISO string.
  const inputToUtc = (wall: string, tz: string): string =>
    !wall ? "" : entryMode === "server" ? zonedInputToIso(wall, tz) : new Date(wall).toISOString();
  const utcToInput = (iso: string | null, tz: string): string =>
    entryMode === "server" ? isoToZonedInput(iso, tz) : isoToLocalInput(iso);

  // "17 May, 14:00 UTC · 16:00 your time" — the resolved instant for a typed
  // value, so the author can sanity-check the conversion at a glance.
  const utcPreview = (wall: string, tz: string): string => {
    const iso = inputToUtc(wall, tz);
    if (!iso) return "";
    const d = new Date(iso);
    const utc = new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    const local = new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
    return `${utc} UTC · ${local} your time`;
  };

  // Re-express a wall clock from one mode to another while keeping the same
  // absolute instant — used when the author flips the toggle so the displayed
  // numbers don't silently change meaning.
  const reinterpret = (
    wall: string,
    tz: string,
    from: "local" | "server",
    to: "local" | "server",
  ): string => {
    if (!wall) return wall;
    const iso = from === "server" ? zonedInputToIso(wall, tz) : new Date(wall).toISOString();
    return to === "server" ? isoToZonedInput(iso, tz) : isoToLocalInput(iso);
  };

  const switchEntryMode = (next: "local" | "server") => {
    if (next === entryMode) return;
    const reconv = (prev: EventForm): EventForm => {
      const tz = prev.timezone || "UTC";
      const serverTimes: EventForm["serverTimes"] = {};
      for (const [k, v] of Object.entries(prev.serverTimes)) {
        const stz = gameServers.find((s) => s.key === k)?.timezone ?? tz;
        serverTimes[k] = {
          start: reinterpret(v.start, stz, entryMode, next),
          end: reinterpret(v.end, stz, entryMode, next),
        };
      }
      return {
        ...prev,
        start_at: reinterpret(prev.start_at, tz, entryMode, next),
        end_at: reinterpret(prev.end_at, tz, entryMode, next),
        serverTimes,
      };
    };
    // Reconvert both current and baseline so flipping the view basis alone
    // isn't treated as an unsaved edit.
    setForm(reconv);
    setInitialForm(reconv);
    setEntryMode(next);
  };

  const loadEvents = (gameSlug: string) => {
    setLoading(true);
    eventsApi
      .list({ include_unpublished: true, ...(gameSlug ? { game: gameSlug } : {}) })
      .then((r) => setEvents(r.data.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!user) return;
    adminApi.games.list().then((r) => setGames(r.data.data ?? []));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadEvents(gameFilter);
  }, [user, gameFilter]);

  // Load the selected game's items for the featured-item picker.
  const loadGameItems = (gameId: string) => {
    if (!gameId) {
      setGameItems([]);
      return;
    }
    setItemsLoading(true);
    itemsApi
      .listAll<ItemOpt>({ game_id: gameId })
      .then((all) => setGameItems(all))
      .catch(() => setGameItems([]))
      .finally(() => setItemsLoading(false));
  };

  // Load the selected game's servers — drives whether the form shows per-server
  // time inputs or a single start/end.
  const loadGameServers = (gameId: string) => {
    if (!gameId) {
      setGameServers([]);
      return;
    }
    eventsApi
      .getServers(gameId)
      .then((r) => setGameServers(r.data.data ?? []))
      .catch(() => setGameServers([]));
  };

  const openCreate = () => {
    const fresh = emptyForm();
    setForm(fresh);
    setInitialForm(fresh);
    setGameItems([]);
    setGameServers([]);
    setItemSearch("");
    setSlugLocked(false);
    setError("");
    setModal({ mode: "create" });
  };

  const openEdit = (ev: EventRow) => {
    const serverTimes: Record<string, { start: string; end: string }> = {};
    for (const s of ev.server_times) {
      serverTimes[s.server_key] = {
        start: utcToInput(s.start_at, s.timezone),
        end: utcToInput(s.end_at, s.timezone),
      };
    }
    const loaded: EventForm = {
      game_id: ev.game_id,
      event_type: ev.event_type,
      slug: ev.slug,
      title: ev.title,
      description: ev.description ?? "",
      image_url: ev.image_url ?? "",
      start_at: utcToInput(ev.start_at, ev.timezone),
      end_at: utcToInput(ev.end_at, ev.timezone),
      timezone: ev.timezone,
      is_published: ev.is_published,
      featuredIds: ev.featured_items.map((f) => f.item_id),
      serverTimes,
    };
    setForm(loaded);
    setInitialForm(loaded);
    setItemSearch("");
    setSlugLocked(true); // slug is immutable once created
    setError("");
    setModal({ mode: "edit", event: ev });
    loadGameItems(ev.game_id);
    loadGameServers(ev.game_id);
  };

  const onGameChange = (gameId: string) => {
    // Featured items and per-server times belong to a single game — switching
    // games clears them. Re-derive the auto-slug against the new game's slugs
    // unless the admin has hand-edited it.
    setForm((f) => ({
      ...f,
      game_id: gameId,
      featuredIds: [],
      serverTimes: {},
      slug: slugLocked ? f.slug : uniqueSlug(toSlug(f.title), gameId, events),
    }));
    loadGameItems(gameId);
    loadGameServers(gameId);
  };

  const setServerTime = (key: string, field: "start" | "end", value: string) =>
    setForm((f) => {
      const cur = f.serverTimes[key] ?? { start: "", end: "" };
      return {
        ...f,
        serverTimes: { ...f.serverTimes, [key]: { ...cur, [field]: value } },
      };
    });

  const toggleFeatured = (itemId: string) => {
    setForm((f) => ({
      ...f,
      featuredIds: f.featuredIds.includes(itemId)
        ? f.featuredIds.filter((id) => id !== itemId)
        : [...f.featuredIds, itemId],
    }));
  };

  const save = async () => {
    setError("");
    if (!form.game_id || !form.slug || !form.title) {
      setError("Game, slug and title are required.");
      return;
    }

    // Per-server timing when the game has servers; otherwise a single window.
    let startIso: string;
    let endIso: string | null;
    let timezone: string;
    let serverTimes: { server_key: string; start_at: string; end_at: string | null }[] | null = null;

    if (gameServers.length > 0) {
      const sorted = [...gameServers].sort((a, b) => a.sort_order - b.sort_order);
      serverTimes = sorted
        .filter((s) => form.serverTimes[s.key]?.start)
        .map((s) => ({
          server_key: s.key,
          // In server mode each row is read as local to its own server zone.
          start_at: inputToUtc(form.serverTimes[s.key].start, s.timezone),
          end_at: form.serverTimes[s.key].end
            ? inputToUtc(form.serverTimes[s.key].end, s.timezone)
            : null,
        }));
      if (serverTimes.length === 0) {
        setError("Enter a start time for at least one server.");
        return;
      }
      // The first server (by sort order) with times is the canonical/primary.
      const primaryKey = serverTimes[0].server_key;
      startIso = serverTimes[0].start_at;
      endIso = serverTimes[0].end_at;
      timezone = sorted.find((s) => s.key === primaryKey)?.timezone ?? "UTC";
    } else {
      if (!form.start_at) {
        setError("Start date is required.");
        return;
      }
      timezone = form.timezone || "UTC";
      startIso = inputToUtc(form.start_at, timezone);
      endIso = form.end_at ? inputToUtc(form.end_at, timezone) : null;
    }

    setSaving(true);
    try {
      const featured = form.featuredIds.map((item_id, i) => ({
        item_id,
        role: "featured",
        order: i,
      }));
      const payload = {
        game_id: form.game_id,
        event_type: form.event_type,
        slug: form.slug,
        title: form.title,
        description: form.description || null,
        image_url: form.image_url || null,
        start_at: startIso,
        end_at: endIso,
        timezone,
        is_published: form.is_published,
      };

      if (modal?.mode === "create") {
        await eventsApi.create({
          ...payload,
          featured_items: featured,
          ...(serverTimes ? { server_times: serverTimes } : {}),
        });
      } else if (modal?.event) {
        await eventsApi.update(modal.event.id, payload);
        await eventsApi.setItems(modal.event.id, featured);
        // Replace (or clear) per-server times to match the form.
        await eventsApi.setServerTimes(modal.event.id, serverTimes ?? []);
      }
      setModal(null);
      loadEvents(gameFilter);
    } catch (e: unknown) {
      setError(extractApiError(e, "Failed to save event"));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await eventsApi.delete(deleteTarget.id);
      setEvents((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    } catch (e: unknown) {
      setError(extractApiError(e, "Failed to delete event"));
    } finally {
      setDeleteTarget(null);
    }
  };

  const closeModal = useCallback(() => setModal(null), []);
  const dirty = !!modal && JSON.stringify(form) !== JSON.stringify(initialForm);
  const guard = useModalCloseGuard({ open: !!modal, dirty, onClose: closeModal });

  if (isLoading || !user) {
    return (
      <main className="flex min-h-[calc(100vh-57px)] items-center justify-center">
        <div className="text-gray-400 animate-pulse">Loading…</div>
      </main>
    );
  }

  const filteredItems = gameItems.filter((it) => {
    if (!itemSearch) return true;
    const q = itemSearch.toLowerCase();
    return it.slug.toLowerCase().includes(q) || itemName(it.data, it.slug).toLowerCase().includes(q);
  });

  // Keep an existing event's custom zone selectable even if it's not in the list.
  const tzOptions =
    form.timezone && !COMMON_TZ.includes(form.timezone) ? [form.timezone, ...COMMON_TZ] : COMMON_TZ;

  const fmtWindow = (ev: EventRow) => {
    const f = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    return ev.end_at ? `${f.format(new Date(ev.start_at))} – ${f.format(new Date(ev.end_at))}` : `From ${f.format(new Date(ev.start_at))}`;
  };

  return (
    <main className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/admin" className="text-gray-400 hover:text-white text-sm">← Admin</Link>
      </div>
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <h1 className="text-3xl font-semibold">Manage Events</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/events/servers"
            className="px-4 py-2 rounded-lg border border-gray-700 text-sm hover:border-amber-500/60 hover:text-amber-300 transition"
          >
            Servers
          </Link>
          <Link
            href="/admin/events/checklists"
            className="px-4 py-2 rounded-lg border border-gray-700 text-sm hover:border-amber-500/60 hover:text-amber-300 transition"
          >
            Checklists
          </Link>
          <select
            value={gameFilter}
            onChange={(e) => setGameFilter(e.target.value)}
            className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm focus:outline-none focus:border-white"
          >
            <option value="">All games</option>
            {games.map((g) => (
              <option key={g.id} value={g.slug}>{g.name}</option>
            ))}
          </select>
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-white text-black rounded-lg text-sm font-semibold hover:bg-gray-200 transition"
          >
            + Add Event
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-gray-400">No events yet. Add the first one.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900">
                  <th className="text-left px-4 py-3 text-gray-400 w-20" />
                  <th className="text-left px-4 py-3 text-gray-400">Title</th>
                  <th className="text-left px-4 py-3 text-gray-400">Game</th>
                  <th className="text-left px-4 py-3 text-gray-400">Type</th>
                  <th className="text-left px-4 py-3 text-gray-400">Window</th>
                  <th className="text-left px-4 py-3 text-gray-400">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-900/50">
                    <td className="px-4 py-2">
                      <ImageSlotThumb src={ev.image_url} alt={`${ev.title} banner`} label="Banner image" width={64} height={36} />
                    </td>
                    <td className="px-4 py-3">
                      {ev.title}
                      {ev.featured_items.length > 0 && (
                        <span className="text-gray-500"> · {ev.featured_items.length}★</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-400">{ev.game_name}</td>
                    <td className="px-4 py-3 text-gray-400">{ev.event_type}</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtWindow(ev)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded ${ev.is_published ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-500"}`}>
                        {ev.is_published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(ev)} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-white transition">Edit</button>
                        <button onClick={() => setDeleteTarget(ev)} className="text-xs px-3 py-1 rounded border border-gray-700 hover:border-red-900 text-red-400 transition">Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && !modal && <p className="text-red-400 text-sm mt-4">{error}</p>}

      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={guard.requestClose}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-[560px] space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-lg">{modal.mode === "create" ? "Add Event" : "Edit Event"}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Game</label>
                <select
                  value={form.game_id}
                  onChange={(e) => onGameChange(e.target.value)}
                  disabled={modal.mode === "edit"}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white disabled:opacity-50"
                >
                  <option value="">Select game…</option>
                  {games.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Type</label>
                <select
                  value={form.event_type}
                  onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                >
                  {EVENT_TYPES.map((ty) => (
                    <option key={ty} value={ty}>{ty}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => {
                  const title = e.target.value;
                  setForm((f) => ({
                    ...f,
                    title,
                    slug: slugLocked ? f.slug : uniqueSlug(toSlug(title), f.game_id, events),
                  }));
                }}
                placeholder="e.g. Rate-Up: Hotaru"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-gray-400">Slug (unique per game)</label>
                {modal.mode === "create" && (
                  <span className="text-xs text-gray-500">
                    {slugLocked ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSlugLocked(false);
                          setForm((f) => ({ ...f, slug: uniqueSlug(toSlug(f.title), f.game_id, events) }));
                        }}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        reset to auto
                      </button>
                    ) : (
                      "auto from title"
                    )}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => {
                  setSlugLocked(true);
                  setForm((f) => ({ ...f, slug: e.target.value }));
                }}
                disabled={modal.mode === "edit"}
                placeholder="auto from title"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 block mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-400">Enter times as</span>
              <div
                className="inline-flex rounded-lg border border-gray-700 overflow-hidden text-xs"
                role="group"
                aria-label="Time entry basis"
              >
                <button
                  type="button"
                  onClick={() => switchEntryMode("local")}
                  aria-pressed={entryMode === "local"}
                  className={`px-3 py-1.5 transition ${entryMode === "local" ? "bg-white text-black font-medium" : "text-gray-300 hover:bg-gray-800"}`}
                >
                  My local time
                </button>
                <button
                  type="button"
                  onClick={() => switchEntryMode("server")}
                  aria-pressed={entryMode === "server"}
                  className={`px-3 py-1.5 transition border-l border-gray-700 ${entryMode === "server" ? "bg-white text-black font-medium" : "text-gray-300 hover:bg-gray-800"}`}
                >
                  Server time
                </button>
              </div>
              <span className="text-[11px] text-gray-500">
                {entryMode === "server"
                  ? "type the source's “Server Time” numbers verbatim"
                  : "type times in your own timezone"}
              </span>
            </div>

            {gameServers.length > 0 ? (
              <div>
                <label className="text-xs text-gray-400 block mb-1">Per-server times</label>
                <div className="space-y-3 rounded-lg border border-gray-800 p-3">
                  {[...gameServers]
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((s) => (
                      <div key={s.key} className="space-y-1.5">
                        <span className="text-xs font-medium text-gray-300" title={s.timezone}>{s.name}</span>
                        <div className="grid grid-cols-[2.5rem_1fr] gap-2 items-center">
                          <span className="text-[11px] text-gray-500">Start</span>
                          <DateTimeField
                            compact
                            ariaLabel={`${s.name} start`}
                            value={form.serverTimes[s.key]?.start ?? ""}
                            onChange={(v) => setServerTime(s.key, "start", v)}
                          />
                          <span className="text-[11px] text-gray-500">End</span>
                          <DateTimeField
                            compact
                            ariaLabel={`${s.name} end`}
                            value={form.serverTimes[s.key]?.end ?? ""}
                            onChange={(v) => setServerTime(s.key, "end", v)}
                          />
                        </div>
                      </div>
                    ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {entryMode === "server"
                    ? "Enter each server’s start / end in that server’s own time (stored as UTC)."
                    : "Enter each server’s start / end in your local time (stored as UTC)."}{" "}
                  Leave a server blank to skip it. The first filled server is the primary/fallback time.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <DateTimeField
                      label="Starts"
                      value={form.start_at}
                      onChange={(v) => setForm((f) => ({ ...f, start_at: v }))}
                    />
                    {form.start_at && (
                      <p className="text-[11px] text-gray-500 mt-1">→ {utcPreview(form.start_at, form.timezone)}</p>
                    )}
                  </div>
                  <div>
                    <DateTimeField
                      label="Ends (optional)"
                      value={form.end_at}
                      onChange={(v) => setForm((f) => ({ ...f, end_at: v }))}
                    />
                    {form.end_at && (
                      <p className="text-[11px] text-gray-500 mt-1">→ {utcPreview(form.end_at, form.timezone)}</p>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-gray-500">
                  {entryMode === "server"
                    ? "Times are read in the server timezone selected below and stored as UTC."
                    : "Times are entered in your local timezone and stored as UTC; the region below is just the server-reset label shown to users."}{" "}
                  Need different times per server?{" "}
                  <Link href="/admin/events/servers" className="text-blue-400 hover:text-blue-300">
                    Define this game&apos;s servers
                  </Link>
                  .
                </p>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">
                    {entryMode === "server"
                      ? "Server timezone (interprets the times above)"
                      : "Server region / timezone"}
                  </label>
                  <select
                    value={form.timezone}
                    onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  >
                    {tzOptions.map((tz) => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <ImageUploadField
              label="Banner image"
              value={form.image_url}
              onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
              placeholder="https://… or upload →"
              previewHeight="h-24"
            />

            {/* Featured items picker */}
            <div>
              <label className="text-xs text-gray-400 block mb-1">
                Featured items {form.featuredIds.length > 0 && `(${form.featuredIds.length})`}
              </label>
              {!form.game_id ? (
                <p className="text-xs text-gray-500">Select a game to pick featured items.</p>
              ) : itemsLoading ? (
                <p className="text-xs text-gray-500">Loading items…</p>
              ) : gameItems.length === 0 ? (
                <p className="text-xs text-gray-500">This game has no items yet.</p>
              ) : (
                <>
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search items…"
                    className="w-full px-3 py-2 mb-2 rounded-lg bg-gray-800 border border-gray-700 text-sm focus:outline-none focus:border-white"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-800 divide-y divide-gray-800">
                    {filteredItems.map((it) => (
                      <label key={it.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-800/60">
                        <input
                          type="checkbox"
                          checked={form.featuredIds.includes(it.id)}
                          onChange={() => toggleFeatured(it.id)}
                        />
                        <span>{itemName(it.data, it.slug)}</span>
                        <span className="text-gray-500 font-mono text-xs">{it.slug}</span>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
              />
              Published (visible on calendars)
            </label>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={save} disabled={saving} className="flex-1 py-2 rounded-lg bg-white text-black text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                {saving ? "Saving…" : modal.mode === "create" ? "Create" : "Save"}
              </button>
              <button onClick={guard.requestClose} className="flex-1 py-2 rounded-lg border border-gray-700 text-sm hover:border-white transition">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={guard.confirming}
        title="Discard changes?"
        description="You have unsaved changes. If you leave now they will not be saved."
        confirmLabel="Discard"
        destructive
        onConfirm={guard.confirmClose}
        onCancel={guard.cancelClose}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete event"
        description={`Delete "${deleteTarget?.title}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </main>
  );
}
