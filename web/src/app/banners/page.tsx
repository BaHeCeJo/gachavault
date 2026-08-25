"use client";

import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useGames, useEvents } from "@/hooks/queries";
import { BannerShowcase } from "@/components/BannerShowcase";
import { type CalendarEvent, currentCycleStart, inCurrentCycle } from "@/lib/events";

interface GameOption {
  slug: string;
  name: string;
}

export default function BannersPage() {
  const t = useTranslations("banners");
  const locale = useLocale();

  const [gameSlug, setGameSlug] = useState("");
  const [scope, setScope] = useState<"current" | "past">("current");

  // Stable "now" for the page lifetime so the query key / current-vs-past
  // split doesn't churn every render.
  const nowIso = useMemo(() => new Date().toISOString(), []);

  const { data: games = [] as GameOption[] } = useGames();

  const params = {
    event_type: "banner",
    ...(gameSlug ? { game: gameSlug } : {}),
    ...(scope === "past" ? { status: "past" } : { from: nowIso }),
  };

  const { data: events = [] as CalendarEvent[], isLoading, isError } = useEvents(params, locale);

  // Same cut as the calendar: "current" is this patch cycle and what has been
  // announced after it. Without it the collaboration warps the wiki publishes
  // with no end date are still listed as running years later.
  const { data: startedVersions = [] as CalendarEvent[] } = useEvents(
    { ...(gameSlug ? { game: gameSlug } : {}), event_type: "version", to: nowIso },
    locale,
  );

  const cycleStart = useMemo(
    () => currentCycleStart(startedVersions, nowIso),
    [startedVersions, nowIso],
  );

  const visibleEvents = useMemo(
    () =>
      scope === "current"
        ? events.filter((e: CalendarEvent) => inCurrentCycle(e, cycleStart, nowIso))
        : events,
    [events, cycleStart, scope, nowIso],
  );

  const selectClass =
    "rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-amber-500/60 focus:outline-none";

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-semibold mb-2">{t("title")}</h1>
      <p className="text-gray-400 mb-8">{t("subtitle")}</p>

      <div className="flex flex-wrap gap-3 mb-8">
        <select
          aria-label={t("filterGame")}
          value={gameSlug}
          onChange={(e) => setGameSlug(e.target.value)}
          className={selectClass}
        >
          <option value="">{t("allGames")}</option>
          {games.map((g: GameOption) => (
            <option key={g.slug} value={g.slug}>
              {g.name}
            </option>
          ))}
        </select>

        <div className="flex rounded-lg border border-gray-700 overflow-hidden">
          {(["current", "past"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`px-3 py-2 text-sm transition ${
                scope === s ? "bg-amber-500 text-black" : "text-gray-300 hover:text-white"
              }`}
            >
              {t(`scope.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <BannerShowcase events={visibleEvents} isLoading={isLoading} isError={isError} />
    </main>
  );
}
