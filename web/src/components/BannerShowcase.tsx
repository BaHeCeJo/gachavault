"use client";

// Banner-focused showcase used by /banners. Unlike the compact CalendarView
// rows, this renders each banner as a hero card with large featured-unit
// portraits — the "what's dropping" view (Prydwen-style). It reads the same
// events-service data as the calendar (event_type = "banner"), so the pull-
// planner (Phase 5) can build on the same featured_items linkage.

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient } from "@/lib/theme";
import {
  type CalendarEvent,
  type EventStatus,
  type ServerTime,
  type FeaturedItem,
  groupEvents,
  featuredIcon,
  relativeTime,
  formatRange,
  formatDateRange,
  effectiveTimes,
  effectiveServerLabel,
  statusOf,
} from "@/lib/events";

interface BannerShowcaseProps {
  events: CalendarEvent[];
  /** Show the game name on each card (off when already on a game page). */
  showGame?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

/** A featured unit's display name — probes the data keys games tend to use,
 *  falling back to a prettified slug so a card never shows a raw kebab id. */
function itemName(f: FeaturedItem): string {
  for (const k of ["name", "title", "display_name"]) {
    const v = f.data[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return f.slug.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BannerShowcase({
  events,
  showGame = true,
  isLoading,
  isError,
}: BannerShowcaseProps) {
  const t = useTranslations("banners");

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 rounded-2xl bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) return <div className="text-red-400">{t("failedToLoad")}</div>;
  if (events.length === 0) return <p className="text-gray-400">{t("empty")}</p>;

  const { active, upcoming, ended } = groupEvents(events);
  const groups: { status: EventStatus; label: string; items: CalendarEvent[] }[] = [
    { status: "active", label: t("current"), items: active },
    { status: "upcoming", label: t("upcoming"), items: upcoming },
    { status: "ended", label: t("ended"), items: ended },
  ];

  return (
    <div className="space-y-10">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.status}>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">
              {g.status === "active" && (
                <span
                  className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"
                  aria-hidden
                />
              )}
              {g.label}
              <span className="text-gray-600">({g.items.length})</span>
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {g.items.map((e) => (
                <BannerCard key={e.id} event={e} status={g.status} showGame={showGame} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}

function countdownLabel(
  status: EventStatus,
  start: string,
  end: string | null,
  locale: string,
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (status === "upcoming") return t("startsRel", { rel: relativeTime(start, locale) });
  if (status === "active") return end ? t("endsRel", { rel: relativeTime(end, locale) }) : t("ongoing");
  return null;
}

function BannerCard({
  event,
  status,
  showGame,
}: {
  event: CalendarEvent;
  status: EventStatus;
  showGame: boolean;
}) {
  const t = useTranslations("banners");
  const locale = useLocale();
  const [showServers, setShowServers] = useState(false);

  const { start, end } = effectiveTimes(event);
  const countdown = countdownLabel(status, start, end, locale, t);
  const featured = event.featured_items;
  const hasServers = event.server_times.length > 0;

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-gray-900 transition hover:border-amber-500/50 ${
        status === "ended" ? "border-gray-800/70 opacity-70" : "border-gray-800"
      }`}
    >
      {/* Hero splash */}
      <div className="relative h-32 w-full overflow-hidden">
        <SafeImage
          src={event.image_url}
          alt={event.title}
          fill
          sizes="(max-width: 640px) 100vw, 400px"
          className="object-cover transition duration-300 group-hover:scale-105"
          fallback={
            <div
              className={`h-full w-full bg-gradient-to-br ${cardGradient(
                event.title || event.game_name,
              )}`}
            />
          }
        />
        {countdown && (
          <span
            className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium backdrop-blur-sm ${
              status === "active" ? "bg-amber-500/90 text-black" : "bg-black/55 text-gray-100"
            }`}
          >
            {countdown}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-3">
        {showGame && event.game_slug && (
          <Link
            href={`/games/${event.game_slug}`}
            className="text-[11px] text-gray-400 hover:text-amber-300 transition"
          >
            {event.game_name}
          </Link>
        )}
        <h3 className="font-semibold leading-snug">{event.title}</h3>
        <p className="mt-0.5 text-xs text-gray-400">
          {formatDateRange(event, locale)}
          <span className="text-gray-600"> · {effectiveServerLabel(event)}</span>
        </p>

        {featured.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            {featured.map((f) => (
              <Link
                key={f.item_id}
                href={`/items/${f.item_id}`}
                title={itemName(f)}
                className="group/item flex w-14 flex-col items-center gap-1 text-center"
              >
                <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-gray-700 bg-gray-800 transition group-hover/item:border-amber-500/60">
                  <SafeImage
                    src={featuredIcon(f.data)}
                    alt={itemName(f)}
                    fill
                    sizes="56px"
                    className="object-cover"
                    fallback={
                      <div className="flex h-full w-full items-center justify-center text-xs uppercase text-gray-400">
                        {f.slug.slice(0, 2)}
                      </div>
                    }
                  />
                </div>
                <span className="w-full truncate text-[10px] text-gray-400 group-hover/item:text-amber-300">
                  {itemName(f)}
                </span>
              </Link>
            ))}
          </div>
        )}

        {hasServers && (
          <button
            type="button"
            onClick={() => setShowServers((v) => !v)}
            className="mt-3 self-start text-xs text-gray-400 hover:text-amber-300 transition"
          >
            {showServers ? "▾" : "▸"} {t("allServers")} ({event.server_times.length})
          </button>
        )}
        {hasServers && showServers && (
          <ServerTable servers={event.server_times} highlight={event.your_server ?? null} t={t} />
        )}
      </div>
    </article>
  );
}

function ServerTable({
  servers,
  highlight,
  t,
}: {
  servers: ServerTime[];
  highlight: string | null;
  t: ReturnType<typeof useTranslations>;
}) {
  const locale = useLocale();
  return (
    <div className="mt-3 pt-3 border-t border-gray-800 overflow-x-auto">
      <table className="w-full text-xs">
        <tbody>
          {servers.map((s) => {
            const st = statusOf(s.start_at, s.end_at);
            const rel = st === "ended" ? t("ended") : countdownLabel(st, s.start_at, s.end_at, locale, t);
            return (
              <tr
                key={s.server_key}
                className={s.server_key === highlight ? "text-amber-300" : "text-gray-400"}
              >
                <td className="py-1 pr-3 font-medium whitespace-nowrap">{s.server_name}</td>
                <td className="py-1 pr-3 whitespace-nowrap">
                  {formatRange(s.start_at, s.end_at, locale)}
                </td>
                <td className="py-1 whitespace-nowrap text-right">{rel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
