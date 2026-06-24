// Shared types + presentation helpers for the calendar feature. Used by the
// global /calendar page, the per-game Calendar tab, and (Phase 3) the
// logged-in homepage widget.

export interface FeaturedItem {
  item_id: string;
  slug: string;
  role: string;
  order: number;
  data: Record<string, unknown>;
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
}

export type EventStatus = "active" | "upcoming" | "ended";

export function eventStatus(e: CalendarEvent, now: number = Date.now()): EventStatus {
  const start = new Date(e.start_at).getTime();
  if (start > now) return "upcoming";
  if (e.end_at && new Date(e.end_at).getTime() < now) return "ended";
  return "active";
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
 *  open-ended event. */
export function formatDateRange(e: CalendarEvent, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = fmt.format(new Date(e.start_at));
  if (!e.end_at) return start;
  return `${start} – ${fmt.format(new Date(e.end_at))}`;
}
