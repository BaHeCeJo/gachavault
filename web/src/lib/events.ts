// Shared types + presentation helpers for the calendar feature. Used by the
// global /calendar page, the per-game Calendar tab, the logged-in homepage
// widget, and the admin authoring UI.

export interface FeaturedItem {
  item_id: string;
  slug: string;
  role: string;
  order: number;
  data: Record<string, unknown>;
}

export interface ServerTime {
  server_key: string;
  server_name: string;
  timezone: string;
  start_at: string;
  end_at: string | null;
}

/** The per-game section banner items live in. Created on demand by the admin
 *  event form and by the backfill migration; keep the three in step. */
export const BANNER_SECTION_SLUG = "banners";

/** The reusable banner an event is a run of, resolved by the API. */
export interface EventBanner {
  id: string;
  slug: string;
  data: Record<string, unknown>;
  game_slug: string;
  section_slug: string;
}

export interface CalendarEvent {
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
  data: Record<string, unknown>;
  is_published: boolean;
  featured_items: FeaturedItem[];
  // Per-server windows (empty for single-server games / events without them).
  server_times: ServerTime[];
  // On the personalized calendar, the viewer's chosen home server for this
  // event's game; drives which window is shown as primary.
  your_server?: string | null;
  // Set on banner events attached to a reusable banner preset. `banner` is the
  // resolved item, null when unattached or for non-banner events.
  banner_item_id?: string | null;
  banner?: EventBanner | null;
}

/** Display name of a banner item, falling back to its slug. */
export function bannerName(b: EventBanner): string {
  const n = b.data?.name;
  return typeof n === "string" && n.length > 0 ? n : b.slug;
}

/** URL of a banner's own detail page. */
export function bannerHref(b: EventBanner): string {
  return `/games/${b.game_slug}/${b.section_slug}/${b.slug}`;
}

export type EventStatus = "active" | "upcoming" | "ended";

/** The window to treat as primary: the viewer's chosen server's times when set
 *  and present, otherwise the event's canonical start/end. */
export function effectiveTimes(e: CalendarEvent): { start: string; end: string | null } {
  if (e.your_server) {
    const s = e.server_times.find((t) => t.server_key === e.your_server);
    if (s) return { start: s.start_at, end: s.end_at };
  }
  return { start: e.start_at, end: e.end_at };
}

/** Label for the primary window's server/timezone. */
export function effectiveServerLabel(e: CalendarEvent): string {
  if (e.your_server) {
    const s = e.server_times.find((t) => t.server_key === e.your_server);
    if (s) return s.server_name;
  }
  return e.timezone;
}

export function statusOf(start: string, end: string | null, now: number = Date.now()): EventStatus {
  if (new Date(start).getTime() > now) return "upcoming";
  if (end && new Date(end).getTime() < now) return "ended";
  return "active";
}

export function eventStatus(e: CalendarEvent, now: number = Date.now()): EventStatus {
  const { start, end } = effectiveTimes(e);
  return statusOf(start, end, now);
}

/** Which run answers "can I pull this now?" on a collectable's page. */
export interface Availability {
  state: EventStatus;
  run: CalendarEvent;
}

/** Pick the run that decides an item's availability, given every run it has
 *  appeared in (any order).
 *
 *  A live run wins; otherwise the soonest announced one; otherwise the most
 *  recent finished one. Checking only whether the newest run has ended would
 *  read a scheduled future banner as live. */
export function availabilityOf(
  runs: CalendarEvent[],
  now: number = Date.now(),
): Availability | null {
  let active: CalendarEvent | null = null;
  let upcoming: CalendarEvent | null = null;
  let ended: CalendarEvent | null = null;
  for (const run of runs) {
    const { start, end } = effectiveTimes(run);
    switch (statusOf(start, end, now)) {
      case "active":
        // A shorter window is the tighter answer to "until when".
        if (!active || new Date(end ?? start) < new Date(effectiveTimes(active).end ?? start)) {
          active = run;
        }
        break;
      case "upcoming":
        if (!upcoming || new Date(start) < new Date(effectiveTimes(upcoming).start)) {
          upcoming = run;
        }
        break;
      default:
        if (!ended || new Date(end ?? start) > new Date(effectiveTimes(ended).end ?? start)) {
          ended = run;
        }
    }
  }
  if (active) return { state: "active", run: active };
  if (upcoming) return { state: "upcoming", run: upcoming };
  if (ended) return { state: "ended", run: ended };
  return null;
}

export interface GroupedEvents {
  active: CalendarEvent[];
  upcoming: CalendarEvent[];
  ended: CalendarEvent[];
}

/** Split events into active / upcoming / ended buckets, each kept in the
 *  start-ascending order the API already returns them in. */
export function groupEvents(events: CalendarEvent[], now: number = Date.now()): GroupedEvents {
  const grouped: GroupedEvents = { active: [], upcoming: [], ended: [] };
  for (const e of events) grouped[eventStatus(e, now)].push(e);
  return grouped;
}

// Type badge colors. Banners are the headline event, so they get the house
// amber; the rest are muted so a calendar full of banners reads cleanly.
const TYPE_BADGE: Record<string, string> = {
  banner: "text-amber-300 border-amber-700/60 bg-amber-900/20",
  version: "text-blue-300 border-blue-700/60 bg-blue-900/20",
  limited_event: "text-purple-300 border-purple-700/60 bg-purple-900/20",
  maintenance: "text-gray-300 border-gray-600 bg-gray-800",
};
const TYPE_BADGE_FALLBACK = "text-gray-300 border-gray-700 bg-gray-800";

export function typeBadgeClass(type: string): string {
  return TYPE_BADGE[type] ?? TYPE_BADGE_FALLBACK;
}

// Fills for the timeline bars. Same hue family as the badges above so a bar and
// its card read as the same thing. Bars carry cover art behind the label, so
// these stay semi-transparent and the text is always white.
const TYPE_BAR: Record<string, string> = {
  banner: "bg-amber-600/70 border-amber-300/70",
  version: "bg-blue-600/70 border-blue-300/70",
  limited_event: "bg-purple-600/70 border-purple-300/70",
  maintenance: "bg-gray-600/70 border-gray-300/60",
};
const TYPE_BAR_FALLBACK = "bg-gray-600/70 border-gray-400/60";

export function typeBarClass(type: string): string {
  return TYPE_BAR[type] ?? TYPE_BAR_FALLBACK;
}

/** Wide artwork for a banner or item, as opposed to the small square avatar
 *  featuredIcon returns. Ordered widest-first: a splash or key-art crops well
 *  into a short wide bar, an avatar does not. */
export function featuredArt(data: Record<string, unknown>): string | null {
  const keys = [
    "art_url",
    "splash_url",
    "banner_url",
    "cover_url",
    "image_url",
    "portrait_url",
    "image",
    "icon_url",
  ];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/** Cover art for an event, in the order that gives the most recognizable
 *  picture: the event's own image, then the art of the banner preset it runs,
 *  then the first featured item. Null falls back to a plain colored bar. */
export function eventArt(e: CalendarEvent): string | null {
  if (e.image_url) return e.image_url;
  if (e.banner) {
    const art = featuredArt(e.banner.data);
    if (art) return art;
  }
  for (const f of e.featured_items) {
    const art = featuredArt(f.data);
    if (art) return art;
  }
  return null;
}

/** Best-effort icon URL for a featured item, probing the data keys games tend
 *  to use. Returns null so callers can fall back to a gradient initial. */
export function featuredIcon(data: Record<string, unknown>): string | null {
  const keys = ["icon_url", "image_url", "image", "icon", "portrait", "avatar", "thumbnail"];
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

/** Localized "in 3 days" / "il y a 2 heures"-style relative label, with the
 *  unit chosen by magnitude. Used for the start/end countdown on event cards. */
export function relativeTime(target: string, locale: string, now: number = Date.now()): string {
  const diff = new Date(target).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(diff);
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (abs >= DAY) return rtf.format(Math.round(diff / DAY), "day");
  if (abs >= HOUR) return rtf.format(Math.round(diff / HOUR), "hour");
  return rtf.format(Math.round(diff / MIN), "minute");
}

/** "Mar 12, 14:00 – Apr 2, 14:00" in the viewer's locale, or "From …" for an
 *  open-ended window. */
export function formatRange(start: string, end: string | null, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const s = fmt.format(new Date(start));
  if (!end) return s;
  return `${s} – ${fmt.format(new Date(end))}`;
}

export function formatDateRange(e: CalendarEvent, locale: string): string {
  const { start, end } = effectiveTimes(e);
  return formatRange(start, end, locale);
}

// ── Current patch cycle ──────────────────────────────────────────────────────
// The events API keeps an event in "current" while it has not ended, and an
// event with no end date never ends. The wiki publishes collaboration warps
// with `time_end = none`, so runs from years ago stay permanently current and,
// because results sort by start ascending, sit at the top of the timeline
// forever. Versions tile the calendar back to back, which gives a better
// definition of "now": the patch cycle that is running.

/** Per game, the start of the newest version that has already begun.
 *
 *  Pass versions the API has filtered to `to = now`; anything later than `now`
 *  is ignored anyway, so an unfiltered list is also safe. */
export function currentCycleStart(versions: CalendarEvent[], nowIso: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const v of versions) {
    if (v.start_at > nowIso) continue;
    const seen = out[v.game_slug];
    if (!seen || v.start_at > seen) out[v.game_slug] = v.start_at;
  }
  return out;
}

/** Whether an event belongs to the current cycle or to what comes after it.
 *
 *  True if it started this cycle (which covers everything announced for later),
 *  or if it is genuinely still running — a limited event that straddles a
 *  version bump is still current. An open-ended event from an older cycle is
 *  not "still running", it is undated, so it fails both tests. A game with no
 *  version timeline has nothing to measure against and keeps everything. */
export function inCurrentCycle(
  event: CalendarEvent,
  cycleStart: Record<string, string>,
  nowIso: string,
): boolean {
  const start = cycleStart[event.game_slug];
  if (!start) return true;
  if (event.start_at >= start) return true;
  return event.end_at !== null && event.end_at >= nowIso;
}
