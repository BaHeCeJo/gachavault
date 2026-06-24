"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient } from "@/lib/theme";
import {
  type CalendarEvent,
  type EventStatus,
  type ServerTime,
  groupEvents,
  typeBadgeClass,
  featuredIcon,
  relativeTime,
  formatRange,
  formatDateRange,
  effectiveTimes,
  effectiveServerLabel,
  statusOf,
} from "@/lib/events";

// Event types we ship a translated label for; anything else renders its raw
// (admin-authored) type string, so new categories work without a code change.
const KNOWN_TYPES = new Set(["banner", "version", "limited_event", "maintenance"]);

interface CalendarViewProps {
  events: CalendarEvent[];
  /** Show the game name on each card (off when already on a game page). */
  showGame?: boolean;
  isLoading?: boolean;
  isError?: boolean;
}

export function CalendarView({ events, showGame = true, isLoading, isError }: CalendarViewProps) {
  const t = useTranslations("calendar");

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <div className="text-red-400">{t("failedToLoad")}</div>;
  }

  if (events.length === 0) {
    return <p className="text-gray-400">{t("empty")}</p>;
  }

  const { active, upcoming, ended } = groupEvents(events);
  const groups: { status: EventStatus; label: string; items: CalendarEvent[] }[] = [
    { status: "active", label: t("activeNow"), items: active },
    { status: "upcoming", label: t("upcoming"), items: upcoming },
    { status: "ended", label: t("ended"), items: ended },
  ];

  return (
    <div className="space-y-8">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.status}>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
              {g.status === "active" && (
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" aria-hidden />
              )}
              {g.label}
              <span className="text-gray-600">({g.items.length})</span>
            </h2>
            <div className="space-y-3">
              {g.items.map((e) => (
                <EventCard key={e.id} event={e} status={g.status} showGame={showGame} />
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

function EventCard({
  event,
  status,
  showGame,
}: {
  event: CalendarEvent;
  status: EventStatus;
  showGame: boolean;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const [showServers, setShowServers] = useState(false);

  const typeLabel = KNOWN_TYPES.has(event.event_type)
    ? t(`types.${event.event_type}`)
    : event.event_type;

  const { start, end } = effectiveTimes(event);
  const countdown = countdownLabel(status, start, end, locale, t);

  const featured = event.featured_items.slice(0, 6);
  const extra = event.featured_items.length - featured.length;
  const hasServers = event.server_times.length > 0;

  return (
    <article
      className={`rounded-xl border bg-gray-900 p-3 sm:p-4 transition hover:border-amber-500/50 ${
        status === "ended" ? "border-gray-800/70 opacity-70" : "border-gray-800"
      }`}
    >
      <div className="flex gap-4">
        {/* Thumbnail */}
        <div className="relative hidden sm:block w-28 h-20 shrink-0 rounded-lg overflow-hidden">
          <SafeImage
            src={event.image_url}
            alt={event.title}
            fill
            sizes="112px"
            className="object-cover"
            fallback={
              <div
                className={`w-full h-full bg-gradient-to-br ${cardGradient(
                  event.game_name || event.title,
                )} flex items-center justify-center text-2xl font-semibold text-white/50`}
              >
                {(event.game_name || event.title)[0]}
              </div>
            }
          />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[11px] px-2 py-0.5 rounded-full border ${typeBadgeClass(event.event_type)}`}>
              {typeLabel}
            </span>
            {showGame && event.game_slug && (
              <Link
                href={`/games/${event.game_slug}`}
                className="text-[11px] text-gray-400 hover:text-amber-300 transition"
              >
                {event.game_name}
              </Link>
            )}
          </div>

          <h3 className="font-semibold truncate">{event.title}</h3>

          <p className="text-xs text-gray-400 mt-0.5">
            {formatDateRange(event, locale)}
            <span className="text-gray-600"> · {effectiveServerLabel(event)}</span>
          </p>

          {featured.length > 0 && (
            <div className="flex items-center gap-1.5 mt-2">
              {featured.map((f) => {
                const icon = featuredIcon(f.data);
                return (
                  <div
                    key={f.item_id}
                    title={f.slug}
                    className="relative w-8 h-8 rounded-full overflow-hidden border border-gray-700 bg-gray-800"
                  >
                    <SafeImage
                      src={icon}
                      alt={f.slug}
                      fill
                      sizes="32px"
                      className="object-cover"
                      fallback={
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 uppercase">
                          {f.slug.slice(0, 2)}
                        </div>
                      }
                    />
                  </div>
                );
              })}
              {extra > 0 && <span className="text-xs text-gray-500">+{extra}</span>}
            </div>
          )}

          {hasServers && (
            <button
              type="button"
              onClick={() => setShowServers((v) => !v)}
              className="mt-2 text-xs text-gray-400 hover:text-amber-300 transition"
            >
              {showServers ? "▾" : "▸"} {t("allServers")} ({event.server_times.length})
            </button>
          )}
        </div>

        {/* Countdown */}
        {countdown && (
          <div className="shrink-0 self-start text-right">
            <span
              className={`text-xs whitespace-nowrap ${
                status === "active" ? "text-amber-300" : "text-gray-400"
              }`}
            >
              {countdown}
            </span>
          </div>
        )}
      </div>

      {hasServers && showServers && (
        <ServerTable servers={event.server_times} highlight={event.your_server ?? null} />
      )}
    </article>
  );
}

function ServerTable({ servers, highlight }: { servers: ServerTime[]; highlight: string | null }) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  return (
    <div className="mt-3 pt-3 border-t border-gray-800 overflow-x-auto">
      <table className="w-full text-xs">
        <tbody>
          {servers.map((s) => {
            const st = statusOf(s.start_at, s.end_at);
            const rel =
              st === "ended" ? t("ended") : countdownLabel(st, s.start_at, s.end_at, locale, t);
            return (
              <tr
                key={s.server_key}
                className={s.server_key === highlight ? "text-amber-300" : "text-gray-400"}
              >
                <td className="py-1 pr-3 font-medium whitespace-nowrap">{s.server_name}</td>
                <td className="py-1 pr-3 whitespace-nowrap">{formatRange(s.start_at, s.end_at, locale)}</td>
                <td className="py-1 whitespace-nowrap text-right">{rel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
