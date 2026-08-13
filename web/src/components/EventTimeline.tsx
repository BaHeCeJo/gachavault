"use client";

// Gantt-style calendar. Every event is a bar on a shared time axis, so
// overlapping windows (two banners running at once, an event straddling a
// version bump) are visible at a glance instead of being flattened into a
// list. Bars are packed into lanes per group: a new lane is only opened when
// an event can't fit beside the ones already placed.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient } from "@/lib/theme";
import {
  type CalendarEvent,
  type EventStatus,
  effectiveTimes,
  eventArt,
  eventStatus,
  featuredIcon,
  typeBarClass,
} from "@/lib/events";

const DAY = 86_400_000;
/** Presets the zoom buttons step through, coarse → fine. Auto-zoom is
 *  continuous and isn't restricted to these. */
const ZOOMS = [1, 2, 4, 8, 16, 32, 64];
const MAX_ZOOM = ZOOMS[ZOOMS.length - 1];
const MIN_ZOOM = ZOOMS[0];
/** Auto-zoom shows roughly this many version cycles at once, so the window is
 *  always about a patch's worth of time no matter how many years of history
 *  are loaded. Scroll for the rest. */
const WINDOW_CYCLES = 1.5;
/** Used when nothing in view says how long a version lasts. */
const FALLBACK_CYCLE_DAYS = 42;
const GUTTER = 132; // px, sticky left column holding group names
const LANE_H = 60; // px, one packed lane — tall enough for cover art + label
const MIN_BAR = 10; // px, so a two-hour maintenance window is still clickable
const BAR_GAP = 4; // px of breathing room required between bars in a lane

/** Roughly how wide the label needs to be to sit inside its bar. Drives both
 *  lane packing (a bar too narrow to hold its name reserves room to the right
 *  for an outside label) and the inside/outside choice when drawing. */
function labelPx(e: CalendarEvent): number {
  // ~6.6px per character at text-xs, plus the icon and padding.
  return Math.min(200, Math.round(e.title.length * 6.6) + 40);
}

interface Placed {
  event: CalendarEvent;
  status: EventStatus;
  startMs: number;
  endMs: number;
  openEnded: boolean;
}

interface Group {
  key: string;
  label: string;
  lanes: Placed[][];
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function addMonth(ms: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + 1);
  return d.getTime();
}

/** Greedy lane packing: place each bar in the first lane where it clears the
 *  previous bar (plus a pixel gap), otherwise open a new lane. */
function packLanes(items: Placed[], pxPerDay: number): Placed[][] {
  // Compare in ms, but reserve the pixels each bar actually occupies on screen:
  // a very short event is still drawn MIN_BAR wide, a bar too narrow for its
  // name needs room for the label spilling out to its right, and every bar
  // needs BAR_GAP after it.
  const gapPx = BAR_GAP + 2;
  const lanes: { items: Placed[]; until: number }[] = [];
  for (const it of [...items].sort((a, b) => a.startMs - b.startMs)) {
    const barPx = Math.max(MIN_BAR, ((it.endMs - it.startMs) / DAY) * pxPerDay);
    const want = labelPx(it.event);
    const needPx = (barPx >= want ? barPx : barPx + want + 6) + gapPx;
    const until = it.startMs + (needPx / pxPerDay) * DAY;
    const lane = lanes.find((l) => it.startMs >= l.until);
    if (lane) {
      lane.items.push(it);
      lane.until = until;
    } else {
      lanes.push({ items: [it], until });
    }
  }
  return lanes.map((l) => l.items);
}

export function EventTimeline({
  events,
  showGame = true,
  onSelect,
  selectedId,
}: {
  events: CalendarEvent[];
  showGame?: boolean;
  onSelect: (e: CalendarEvent) => void;
  selectedId: string | null;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1000);
  const [zoom, setZoom] = useState<number | null>(null); // null = auto-fit
  const [now, setNow] = useState(() => Date.now());

  // Keep the "now" marker honest without re-rendering constantly.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Track the viewport so auto-fit picks a zoom that shows the whole span.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const { rangeStart, rangeEnd, placed } = useMemo(() => {
    // Span the events themselves, not events-plus-today: a calendar of events
    // that all ended in 2024 would otherwise stretch across every empty month
    // since, squeezing each bar down to a few pixels. When now falls outside
    // the span the marker simply isn't drawn.
    let min = events.length ? Infinity : now;
    let max = events.length ? -Infinity : now + 7 * DAY;
    for (const e of events) {
      const { start, end } = effectiveTimes(e);
      const s = new Date(start).getTime();
      min = Math.min(min, s);
      max = Math.max(max, end ? new Date(end).getTime() : s + 14 * DAY);
    }
    const rs = startOfDay(min) - DAY;
    const re = startOfDay(max) + 2 * DAY;
    const items: Placed[] = events.map((e) => {
      const { start, end } = effectiveTimes(e);
      const s = new Date(start).getTime();
      return {
        event: e,
        status: eventStatus(e, now),
        startMs: s,
        endMs: end ? new Date(end).getTime() : re,
        openEnded: !end,
      };
    });
    return { rangeStart: rs, rangeEnd: re, placed: items };
  }, [events, now]);

  const spanDays = Math.max(1, (rangeEnd - rangeStart) / DAY);
  const track = Math.max(240, width - GUTTER);
  // How long a patch cycle runs, in days: the median version event in view,
  // falling back to the median of everything else (a banner is usually about a
  // half-cycle, so double it) and finally to a stock six weeks.
  const cycleDays = useMemo(() => {
    const median = (arr: number[]) =>
      arr.length ? [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)] : null;
    const days = (p: Placed) => (p.endMs - p.startMs) / DAY;
    const versions = placed
      .filter((p) => p.event.event_type === "version")
      .map(days)
      .filter((d) => d > 0);
    const versionMedian = median(versions);
    if (versionMedian) return versionMedian;
    const restMedian = median(placed.map(days).filter((d) => d > 0));
    return restMedian ? restMedian * 2 : FALLBACK_CYCLE_DAYS;
  }, [placed]);

  const autoZoom = useMemo(() => {
    // Scale so the viewport spans about one patch cycle. This keeps the pixel
    // scale steady whether the calendar holds two months or five years of
    // history — years of banners no longer squeeze every bar into a sliver.
    const cycleZoom = track / (cycleDays * WINDOW_CYCLES);
    // If the whole span fits at a higher zoom than that, spend the space.
    const fit = track / spanDays;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cycleZoom, fit));
  }, [track, spanDays, cycleDays]);
  const pxPerDay = zoom ?? autoZoom;
  const contentW = Math.max(track, spanDays * pxPerDay);

  const groups: Group[] = useMemo(() => {
    if (!showGame) return [{ key: "all", label: "", lanes: packLanes(placed, pxPerDay) }];
    const byGame = new Map<string, Placed[]>();
    for (const p of placed) {
      const k = p.event.game_slug || p.event.game_id;
      const arr = byGame.get(k);
      if (arr) arr.push(p);
      else byGame.set(k, [p]);
    }
    return [...byGame.entries()]
      .map(([key, items]) => ({
        key,
        label: items[0].event.game_name || key,
        lanes: packLanes(items, pxPerDay),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [placed, showGame, pxPerDay]);

  const xOf = useCallback(
    (ms: number) => ((ms - rangeStart) / DAY) * pxPerDay,
    [rangeStart, pxPerDay],
  );
  const nowX = xOf(now);

  // Ruler: month bands always, plus day/week gridlines once there's room.
  const months = useMemo(() => {
    const out: { left: number; width: number; label: string }[] = [];
    const fmt = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" });
    for (let m = startOfMonth(rangeStart); m < rangeEnd; m = addMonth(m)) {
      const next = addMonth(m);
      const left = Math.max(0, xOf(m));
      out.push({ left, width: Math.min(xOf(next), contentW) - left, label: fmt.format(new Date(m)) });
    }
    return out;
  }, [rangeStart, rangeEnd, contentW, locale, xOf]);

  const ticks = useMemo(() => {
    const step = pxPerDay >= 24 ? 1 : pxPerDay >= 6 ? 7 : 0;
    if (step === 0) return [];
    const out: { left: number; label: string | null }[] = [];
    const fmt = new Intl.DateTimeFormat(locale, { day: "numeric" });
    for (let d = rangeStart; d < rangeEnd; d += step * DAY) {
      out.push({ left: xOf(d), label: pxPerDay >= 24 ? fmt.format(new Date(d)) : null });
    }
    return out;
  }, [rangeStart, rangeEnd, pxPerDay, locale, xOf]);

  // Auto-zoom is continuous, so the buttons step to the next preset either
  // side of wherever it landed rather than indexing into ZOOMS.
  const zoomInTo = ZOOMS.find((z) => z > pxPerDay * 1.01) ?? null;
  const zoomOutTo = [...ZOOMS].reverse().find((z) => z < pxPerDay * 0.99) ?? null;
  const scrollToNow = () => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ left: Math.max(0, nowX - el.clientWidth / 2), behavior: "smooth" });
  };

  // The axis is usually wider than the viewport now, and its left edge is the
  // oldest event — open on today instead, or on the most recent events when
  // today is off the end of the range.
  const homed = useRef(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || homed.current || contentW <= el.clientWidth) return;
    homed.current = true;
    const target = nowX > contentW ? contentW : nowX;
    el.scrollLeft = Math.max(0, target - el.clientWidth / 2);
  }, [contentW, nowX]);

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-2">
        <button
          type="button"
          onClick={scrollToNow}
          className="px-2.5 py-1 text-xs rounded-md border border-gray-700 text-gray-300 hover:border-amber-500/60 hover:text-amber-300 transition"
        >
          {t("jumpToNow")}
        </button>
        <div className="flex rounded-md border border-gray-700 overflow-hidden">
          <button
            type="button"
            aria-label={t("zoomOut")}
            disabled={zoomOutTo === null}
            onClick={() => zoomOutTo !== null && setZoom(zoomOutTo)}
            className="px-2.5 py-1 text-xs text-gray-300 hover:text-amber-300 disabled:opacity-30 transition"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom(null)}
            className="px-2.5 py-1 text-xs text-gray-300 hover:text-amber-300 border-x border-gray-700 transition"
          >
            {t("fit")}
          </button>
          <button
            type="button"
            aria-label={t("zoomIn")}
            disabled={zoomInTo === null}
            onClick={() => zoomInTo !== null && setZoom(zoomInTo)}
            className="px-2.5 py-1 text-xs text-gray-300 hover:text-amber-300 disabled:opacity-30 transition"
          >
            +
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="relative overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/60"
      >
        <div style={{ width: GUTTER + contentW }} className="relative">
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex bg-gray-900/95 backdrop-blur border-b border-gray-800">
            <div
              className="sticky left-0 z-10 shrink-0 bg-gray-900/95 border-r border-gray-800"
              style={{ width: GUTTER }}
            />
            <div className="relative h-9" style={{ width: contentW }}>
              {months.map((m) => (
                <div
                  key={m.left}
                  className="absolute top-0 h-full border-l border-gray-700/70 px-2 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400 whitespace-nowrap overflow-hidden"
                  style={{ left: m.left, width: m.width }}
                >
                  {m.width > 46 ? m.label : ""}
                </div>
              ))}
              {ticks.map((tk) => (
                <div
                  key={tk.left}
                  className="absolute bottom-0 text-[10px] text-gray-600"
                  style={{ left: tk.left + 2 }}
                >
                  {tk.label}
                </div>
              ))}
            </div>
          </div>

          {/* Rows */}
          <div className="relative">
            {/* Gridlines + now marker, drawn behind the bars */}
            <div
              className="pointer-events-none absolute inset-y-0 z-0"
              style={{ left: GUTTER, width: contentW }}
            >
              {months.map((m) => (
                <div
                  key={`g${m.left}`}
                  className="absolute inset-y-0 border-l border-gray-800"
                  style={{ left: m.left }}
                />
              ))}
              {ticks.map((tk) => (
                <div
                  key={`t${tk.left}`}
                  className="absolute inset-y-0 border-l border-gray-800/40"
                  style={{ left: tk.left }}
                />
              ))}
              {nowX >= 0 && nowX <= contentW && (
                <div className="absolute inset-y-0 z-10 border-l-2 border-amber-400/80" style={{ left: nowX }}>
                  <span className="absolute -top-0.5 left-1 text-[10px] font-semibold text-amber-300 whitespace-nowrap">
                    {t("nowMarker")}
                  </span>
                </div>
              )}
            </div>

            {groups.map((g) => (
              <div key={g.key} className="relative flex border-b border-gray-800/70 last:border-b-0">
                <div
                  className="sticky left-0 z-10 shrink-0 border-r border-gray-800 bg-gray-900/95 px-3 py-2 text-xs font-medium text-gray-300 truncate"
                  style={{ width: GUTTER }}
                  title={g.label}
                >
                  {g.label}
                </div>
                <div
                  className="relative"
                  style={{ width: contentW, height: g.lanes.length * LANE_H + 8 }}
                >
                  {g.lanes.map((lane, li) =>
                    lane.map((p) => (
                      <Bar
                        key={p.event.id}
                        placed={p}
                        top={li * LANE_H + 4}
                        left={xOf(p.startMs)}
                        width={Math.max(MIN_BAR, xOf(p.endMs) - xOf(p.startMs))}
                        selected={selectedId === p.event.id}
                        onSelect={onSelect}
                      />
                    )),
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar({
  placed,
  top,
  left,
  width,
  selected,
  onSelect,
}: {
  placed: Placed;
  top: number;
  left: number;
  width: number;
  selected: boolean;
  onSelect: (e: CalendarEvent) => void;
}) {
  const { event, status, openEnded } = placed;
  const height = LANE_H - 12;
  const art = eventArt(event);
  // Wide enough to hold the name? Otherwise the label sits beside the bar —
  // packLanes already reserved that space, so it won't land on a neighbour.
  const inside = width >= labelPx(event);
  const icons = event.featured_items
    .map((f) => featuredIcon(f.data))
    .filter((u): u is string => !!u)
    .slice(0, 3);
  // Only show the roster once the name is comfortably placed.
  const showIcons = inside && width >= labelPx(event) + 34;
  // The outside label's thumbnail is a small square, so prefer a square avatar
  // over the wide key art that fills the bar itself.
  const thumb = icons[0] ?? art;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(event)}
        title={event.title}
        style={{ top, left, width, height }}
        className={`absolute overflow-hidden rounded-md border text-left transition ${typeBarClass(
          event.event_type,
        )} ${openEnded ? "rounded-r-none" : ""} ${
          status === "ended" ? "opacity-50 hover:opacity-80" : "hover:brightness-125"
        } ${selected ? "z-10 opacity-100 ring-2 ring-white/80" : ""}`}
      >
        {art && (
          <SafeImage
            src={art}
            alt=""
            fill
            sizes="(max-width: 768px) 60vw, 480px"
            // Key art is usually centered on a character's upper body; bias the
            // crop upward so a short wide bar keeps the face.
            focus="50% 30%"
            className="object-cover opacity-80"
            fallback={null}
          />
        )}
        {/* Keeps the label readable over whatever art landed behind it. */}
        {art && <span className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/10" />}
        <span className="relative flex h-full items-center gap-1.5 px-1.5">
          {showIcons &&
            icons.map((src, i) => (
              <span
                key={i}
                className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full border border-white/50 bg-gray-800"
              >
                <SafeImage src={src} alt="" fill sizes="28px" className="object-cover" fallback={null} />
              </span>
            ))}
          {inside && (
            <span className="truncate text-xs font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
              {event.title}
            </span>
          )}
        </span>
      </button>

      {!inside && (
        <span
          className={`pointer-events-none absolute flex items-center gap-1.5 whitespace-nowrap text-xs ${
            status === "ended" ? "text-gray-500" : "text-gray-300"
          }`}
          style={{ top, left: left + width + 5, height }}
        >
          <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-md border border-gray-700 bg-gray-800">
            <SafeImage
              src={thumb}
              alt=""
              fill
              sizes="28px"
              className="object-cover"
              fallback={
                <span
                  className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-[9px] text-white/60 ${cardGradient(
                    event.title,
                  )}`}
                >
                  {event.title[0]}
                </span>
              }
            />
          </span>
          {event.title}
        </span>
      )}
    </>
  );
}
