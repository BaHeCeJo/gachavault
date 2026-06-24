"use client";

import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { SafeImage } from "@/components/SafeImage";
import { cardGradient } from "@/lib/theme";
import {
  type CalendarEvent,
  type EventStatus,
  groupEvents,
  typeBadgeClass,
  featuredIcon,
  relativeTime,
  formatDateRange,
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

  const typeLabel = KNOWN_TYPES.has(event.event_type)
    ? t(`types.${event.event_type}`)
    : event.event_type;

  // Countdown line: time until start for upcoming, time until end for active.
  let countdown: string | null = null;
  if (status === "upcoming") {
    countdown = t("startsRel", { rel: relativeTime(event.start_at, locale) });
  } else if (status === "active") {
    countdown = event.end_at
      ? t("endsRel", { rel: relativeTime(event.end_at, locale) })
      : t("ongoing");
  }

  const featured = event.featured_items.slice(0, 6);
  const extra = event.featured_items.length - featured.length;

  return (
    <article
      className={`flex gap-4 rounded-xl border bg-gray-900 p-3 sm:p-4 transition hover:border-amber-500/50 ${
        status === "ended" ? "border-gray-800/70 opacity-70" : "border-gray-800"
      }`}
    >
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
          <span className="text-gray-600"> · {event.timezone}</span>
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
    </article>
  );
}
